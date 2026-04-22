import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { toMonthDayKey } from '../shared/utc';
import { getTodayArtifact, refreshScheduledArtifacts, type WorkerBindings } from './lib/generate';

type AppEnv = {
	Bindings: WorkerBindings;
};

const app = new Hono<AppEnv>();

function defaultCache(): Cache {
	return (caches as unknown as { default: Cache }).default;
}

app.use('/api/*', cors());

app.get('/api/today', async (c) => {
	const now = new Date();
	const cacheKey = new Request(new URL(`/api/today?cache=${toMonthDayKey(now)}`, c.req.url).toString());
	const cached = await defaultCache().match(cacheKey);
	if (cached) return cached;

	const payload = await getTodayArtifact(c.env, now);
	const response = c.json(payload, 200, {
		'Cache-Control': 'public, max-age=300, stale-while-revalidate=900',
	});
	await defaultCache().put(cacheKey, response.clone());
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
