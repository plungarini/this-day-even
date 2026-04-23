import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ApiErrorPayload, MeResponse } from '../shared/types';
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

function inferSubsystem(error: unknown): ApiErrorPayload['error']['subsystem'] {
	const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
	if (message.includes('d1') || message.includes('sqlite')) return 'd1';
	if (message.includes('access') || message.includes('trial')) return 'access';
	if (message.includes('artifact') || message.includes('wikimedia')) return 'artifact_generation';
	if (message.includes('fetch')) return 'upstream_fetch';
	return 'unknown';
}

function errorPayload(
	status: number,
	code: string,
	message: string,
	subsystem: ApiErrorPayload['error']['subsystem'],
	requestId?: string,
): ApiErrorPayload {
	const resolvedRequestId = requestId ?? crypto.randomUUID();
	return {
		ok: false,
		error: {
			code,
			message,
			requestId: resolvedRequestId,
			subsystem,
			status,
		},
	};
}

function jsonErrorResponse(
	status: number,
	code: string,
	message: string,
	subsystem: ApiErrorPayload['error']['subsystem'],
	requestId?: string,
): Response {
	return jsonResponse(errorPayload(status, code, message, subsystem, requestId), status, {
		'Cache-Control': 'no-store',
	});
}

app.use('/api/*', cors());

app.get('/api/today', async (c) => {
	try {
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
	} catch (error) {
		console.error('This Day /api/today failed', error);
		return jsonErrorResponse(503, 'THIS_DAY_TODAY_UNAVAILABLE', 'Today could not be prepared right now.', inferSubsystem(error));
	}
});

app.get('/api/me', async (c) => {
	try {
		const identity = readIdentityFromHeaders(c.req.raw.headers);
		const payload = await buildMeResponse(c.env, identity).catch((error) => {
			console.error('This Day account lookup failed for /api/me', error);
			if (isFreePhase(c.env)) {
				throw error;
			}
			throw error;
		});
		return jsonResponse(payload, 200, {
			'Cache-Control': 'no-store',
		});
	} catch (error) {
		console.error('This Day /api/me failed', error);
		return jsonErrorResponse(503, 'THIS_DAY_ACCOUNT_UNAVAILABLE', 'Account status could not be loaded right now.', inferSubsystem(error));
	}
});

app.post('/api/access/checkout', async (c) => {
	try {
		const identity = readIdentityFromHeaders(c.req.raw.headers);
		if (!identity.evenUid) {
			return jsonErrorResponse(400, 'THIS_DAY_MISSING_EVEN_UID', 'Missing Even user identity header.', 'account');
		}

		const payload = await buildCheckoutResponse(c.env, identity);
		return jsonResponse(payload, 200, {
			'Cache-Control': 'no-store',
		});
	} catch (error) {
		console.error('This Day /api/access/checkout failed', error);
		return jsonErrorResponse(503, 'THIS_DAY_CHECKOUT_UNAVAILABLE', 'Checkout is not available right now.', 'payments');
	}
});

app.post('/api/payments/webhook', async (c) => {
	try {
		const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
		if (!body || typeof body.id !== 'string' || typeof body.provider !== 'string' || typeof body.type !== 'string') {
			return jsonErrorResponse(400, 'THIS_DAY_INVALID_WEBHOOK', 'Expected webhook payload with id, provider, and type.', 'payments');
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
	} catch (error) {
		console.error('This Day /api/payments/webhook failed', error);
		return jsonErrorResponse(503, 'THIS_DAY_WEBHOOK_UNAVAILABLE', 'Payment webhook processing failed.', 'payments');
	}
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
