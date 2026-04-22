import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { buildCheckoutResponse, buildFreeAccessState, buildMeResponse, buildPaywallResponse, ingestPaymentWebhook, readIdentityFromHeaders, recordRequestEvent, resolveAccess } from './lib/access';
import { toMonthDayKey } from '../shared/utc';
import { getTodayArtifact, regenerateTodayArtifact, refreshScheduledArtifacts, type WorkerBindings } from './lib/generate';

type AppEnv = {
	Bindings: WorkerBindings;
};

const app = new Hono<AppEnv>();

function jsonResponse(payload: unknown, status = 200, headers?: HeadersInit): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...headers,
		},
	});
}

function defaultCache(): Cache {
	return (caches as unknown as { default: Cache }).default;
}

async function clearCacheEntry(request: Request): Promise<void> {
	const cache = defaultCache() as Cache & { delete?: (request: Request) => Promise<boolean> };
	if (typeof cache.delete === 'function') {
		await cache.delete(request);
	}
}

function buildTodayCacheKey(requestUrl: string, date: Date): Request {
	return new Request(new URL(`/api/today?cache=${toMonthDayKey(date)}`, requestUrl).toString());
}

function isLocalRequest(url: string): boolean {
	const hostname = new URL(url).hostname;
	return hostname === '127.0.0.1' || hostname === 'localhost';
}

function isFreePhase(env: WorkerBindings): boolean {
	return env.ACCESS_PHASE !== 'gated';
}

app.use('/api/*', cors());

app.get('/api/today', async (c) => {
	const identity = readIdentityFromHeaders(c.req.raw.headers);
	const access = await resolveAccess(c.env, identity).catch((error) => {
		console.error('This Day access resolution failed for /api/today', error);
		if (isFreePhase(c.env)) {
			return buildFreeAccessState();
		}
		throw error;
	});
	if (access.phase === 'gated' && !access.accessAllowed) {
		await recordRequestEvent(c.env, identity, 'denied', '/api/today', c.req.header('X-App-Version'));
		return jsonResponse(buildPaywallResponse(access), 402, {
			'Cache-Control': 'no-store',
		});
	}

	const now = new Date();
	const cacheKey = buildTodayCacheKey(c.req.url, now);
	const cached = await defaultCache().match(cacheKey);
	if (cached) {
		await recordRequestEvent(c.env, identity, access.state === 'trial_active' ? 'trial' : 'served', '/api/today', c.req.header('X-App-Version'));
		return cached.clone();
	}

	const payload = await getTodayArtifact(c.env, now);
	const response = jsonResponse(payload, 200, {
		'Cache-Control': 'no-store',
	});
	await defaultCache().put(cacheKey, response.clone());
	await recordRequestEvent(
		c.env,
		identity,
		payload.isFallback ? 'fallback' : access.state === 'trial_active' ? 'trial' : 'served',
		'/api/today',
		c.req.header('X-App-Version'),
	);
	return response;
});

app.get('/api/me', async (c) => {
	const identity = readIdentityFromHeaders(c.req.raw.headers);
	const payload = await buildMeResponse(c.env, identity).catch((error) => {
		console.error('This Day account lookup failed for /api/me', error);
		if (isFreePhase(c.env)) {
			return {
				user: {
					appUserId: null,
					evenUid: identity.evenUid,
					country: identity.country,
				},
				access: {
					phase: 'free' as const,
					state: 'free' as const,
					accessAllowed: true,
					trialStartedAt: null,
					trialEndsAt: null,
					activeUntil: null,
					appUserId: null,
					evenUid: identity.evenUid,
				},
			};
		}
		throw error;
	});
	return jsonResponse(payload, 200, {
		'Cache-Control': 'no-store',
	});
});

app.post('/api/access/checkout', async (c) => {
	const identity = readIdentityFromHeaders(c.req.raw.headers);
	if (!identity.evenUid) {
		return jsonResponse({ error: 'Missing X-Even-User-Uid header.' }, 400);
	}

	const payload = await buildCheckoutResponse(c.env, identity);
	return jsonResponse(payload, 200, {
		'Cache-Control': 'no-store',
	});
});

app.post('/api/payments/webhook', async (c) => {
	const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body || typeof body.id !== 'string' || typeof body.provider !== 'string' || typeof body.type !== 'string') {
		return jsonResponse({ error: 'Expected webhook payload with id, provider, and type.' }, 400);
	}

	const result = await ingestPaymentWebhook(c.env, {
		id: body.id,
		provider: body.provider,
		type: body.type,
		evenUid: typeof body.evenUid === 'string' ? body.evenUid : undefined,
		externalCustomerId: typeof body.externalCustomerId === 'string' ? body.externalCustomerId : undefined,
		externalSubscriptionId: typeof body.externalSubscriptionId === 'string' ? body.externalSubscriptionId : undefined,
		startsAt: typeof body.startsAt === 'string' ? body.startsAt : undefined,
		endsAt: typeof body.endsAt === 'string' ? body.endsAt : undefined,
		status: typeof body.status === 'string' ? body.status : undefined,
		payload: typeof body.payload === 'object' && body.payload !== null ? (body.payload as Record<string, unknown>) : body,
	});

	return jsonResponse(result, 200, {
		'Cache-Control': 'no-store',
	});
});

app.post('/api/dev/reset-today', async (c) => {
	if (!isLocalRequest(c.req.url)) {
		return jsonResponse({ error: 'This endpoint is available only in local development.' }, 403);
	}

	const now = new Date();
	const cacheKey = buildTodayCacheKey(c.req.url, now);
	await clearCacheEntry(cacheKey);
	const payload = await regenerateTodayArtifact(c.env, now);
	const response = jsonResponse(
		{
			ok: true,
			key: payload.key,
			title: payload.fact.title,
			generatedAt: payload.generatedAt,
		},
		200,
		{
			'Cache-Control': 'no-store',
		},
	);
	return response;
});

app.notFound((c) => c.text('Not found', 404));

export default {
	fetch: app.fetch,
	async scheduled(event: ScheduledController, env: WorkerBindings, ctx: ExecutionContext) {
		const date = new Date(event.scheduledTime || Date.now());
		ctx.waitUntil(refreshScheduledArtifacts(env, date));
	},
};
