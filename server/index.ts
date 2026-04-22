import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { toMonthDayKey } from '../shared/utc';
import { getTodayArtifact, regenerateTodayArtifact, refreshScheduledArtifacts, type WorkerBindings } from './lib/generate';

type AppEnv = {
	Bindings: WorkerBindings;
};

const app = new Hono<AppEnv>();

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

app.use('/api/*', cors());

app.get('/api/today', async (c) => {
	const now = new Date();
	const cacheKey = buildTodayCacheKey(c.req.url, now);
	const cached = await defaultCache().match(cacheKey);
	if (cached) return cached;

	const payload = await getTodayArtifact(c.env, now);
	const response = c.json(payload, 200, {
		'Cache-Control': 'no-store',
	});
	await defaultCache().put(cacheKey, response.clone());
	return response;
});

app.post('/api/dev/reset-today', async (c) => {
	if (!isLocalRequest(c.req.url)) {
		return c.json({ error: 'This endpoint is available only in local development.' }, 403);
	}

	const now = new Date();
	const cacheKey = buildTodayCacheKey(c.req.url, now);
	await clearCacheEntry(cacheKey);
	const payload = await regenerateTodayArtifact(c.env, now);
	const response = c.json(
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
