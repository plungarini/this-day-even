import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodayResponse } from '../shared/types';
import worker from '../server/index';
import { generateArtifact, refreshScheduledArtifacts, type WorkerBindings } from '../server/lib/generate';
import { fetchWikimediaCandidates } from '../server/lib/source-providers';
import { readStoredArtifact, writeStoredArtifact } from '../server/lib/storage';

const sampleWikimediaPayload = [
	{
		year: 1902,
		text: 'Marie Curie isolates radium for the first time.',
		pages: [
			{
				title: 'Marie Curie',
				description: 'Polish and naturalized-French physicist and chemist',
				extract: 'Marie Curie pioneered research on radioactivity.',
				content_urls: {
					desktop: {
						page: 'https://en.wikipedia.org/wiki/Marie_Curie',
					},
				},
				thumbnail: {
					source: 'https://upload.wikimedia.org/example.jpg',
				},
			},
		],
	},
];

function createJsonResponse(payload: unknown) {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
		},
	});
}

const baseEnv: WorkerBindings = {
	APP_BASE_URL: 'http://127.0.0.1:3001',
	APP_NAME: 'This Day',
};

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('worker pipeline', () => {
	it('normalizes Wikimedia candidates', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createJsonResponse(sampleWikimediaPayload));
		const candidates = await fetchWikimediaCandidates(new Date('2026-04-20T00:00:00.000Z'));
		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.text).toContain('Marie Curie');
		expect(candidates[0]?.pages[0]?.title).toBe('Marie Curie');
	});

	it('generates a deterministic fallback artifact when LLM config is absent', async () => {
		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(createJsonResponse(sampleWikimediaPayload))
			.mockResolvedValueOnce(
				createJsonResponse({
					extract: 'Marie Curie pioneered research on radioactivity and chemistry.',
					description: 'Polish and naturalized-French physicist and chemist',
					thumbnail: {
						source: 'https://upload.wikimedia.org/example.jpg',
						width: 320,
						height: 180,
					},
				}),
			)
			.mockResolvedValueOnce(createJsonResponse({ results: [] }))
			.mockResolvedValueOnce(createJsonResponse({ docs: [] }));

		const artifact = await generateArtifact(baseEnv, new Date('2026-04-20T00:00:00.000Z'));
		expect(artifact.fact.title).toContain('Marie Curie');
		expect(artifact.fact.sections).toHaveLength(5);
		expect(artifact.fact.sections[0]?.id).toBe('moment');
	});

	it('keeps the previous stored artifact when scheduled refresh fails', async () => {
		const previous = {
			dateUtc: '2026-04-20',
			key: '04-20',
			generatedAt: '2026-04-20T00:00:00.000Z',
			isFallback: false,
			fact: {
				slug: 'existing',
				year: 1900,
				title: 'Existing artifact',
				deck: 'Existing deck',
				summary: 'Existing summary',
				sections: [],
				taxonomy: { categories: ['Existing'] },
				scoring: { retention: 50, obscurity: 50, weirdness: 50, compressibility: 50, confidence: 50 },
			},
			sources: [],
		};

		await writeStoredArtifact(baseEnv, '04-20', previous as never);
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

		await refreshScheduledArtifacts(baseEnv, new Date('2026-04-20T00:00:00.000Z'));
		const stored = await readStoredArtifact(baseEnv, '04-20');
		expect(stored?.fact.title).toBe('Existing artifact');
	});

	it('serves a stable cached artifact for the same UTC day', async () => {
		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(createJsonResponse(sampleWikimediaPayload))
			.mockResolvedValueOnce(
				createJsonResponse({
					extract: 'Marie Curie pioneered research on radioactivity and chemistry.',
					description: 'Polish and naturalized-French physicist and chemist',
					thumbnail: {
						source: 'https://upload.wikimedia.org/example.jpg',
						width: 320,
						height: 180,
					},
				}),
			)
			.mockResolvedValueOnce(createJsonResponse({ results: [] }))
			.mockResolvedValueOnce(createJsonResponse({ docs: [] }));

		const request = new Request('http://127.0.0.1:3001/api/today');
		const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
		const first = await worker.fetch(request, baseEnv, ctx);
		const second = await worker.fetch(request, baseEnv, ctx);
		const firstPayload = (await first.json()) as TodayResponse;
		const secondPayload = (await second.json()) as TodayResponse;
		expect(secondPayload.key).toBe(firstPayload.key);
		expect(secondPayload.fact.title).toBe(firstPayload.fact.title);
	});
});
