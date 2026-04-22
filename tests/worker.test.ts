import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodayResponse } from '../shared/types';
import worker from '../server/index';
import { generateArtifact, refreshScheduledArtifacts, type WorkerBindings } from '../server/lib/generate';
import { cleanLocSnippet, fetchLocSnippet, fetchWikimediaCandidates } from '../server/lib/source-providers';
import { buildArtifactResponse } from '../server/lib/seed';
import { writerDraftSchema } from '../server/lib/schemas';
import { readStoredArtifact, writeStoredArtifact } from '../server/lib/storage';
import { toMonthDayKey } from '../shared/utc';

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

	it('can reset and regenerate today locally on command', async () => {
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
			.mockResolvedValueOnce(createJsonResponse({ docs: [] }))
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

		const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
		await worker.fetch(new Request('http://127.0.0.1:3001/api/today'), baseEnv, ctx);
		const resetResponse = await worker.fetch(new Request('http://127.0.0.1:3001/api/dev/reset-today', { method: 'POST' }), baseEnv, ctx);
		const resetPayload = (await resetResponse.json()) as { ok: boolean; key: string; title: string };

		expect(resetResponse.status).toBe(200);
		expect(resetPayload.ok).toBe(true);
		expect(resetPayload.key).toBe(toMonthDayKey(new Date()));
		expect(resetPayload.title).toContain('Marie Curie');
	});

	it('rejects writer drafts with meta text, wrong titles, and section noise', () => {
		expect(() =>
			writerDraftSchema.parse({
				slug: 'bad-draft',
				title: 'World War II: Sachsenhausen concentration camp is liberated',
				deck: 'A sharp historical curiosity from 04-22, optimized for one compelling minute on glasses.',
				summary: 'A factual summary.',
				taxonomy: { categories: ['Conflict'] },
				scoring: {
					retention: 80,
					obscurity: 60,
					weirdness: 45,
					compressibility: 70,
					confidence: 90,
				},
				sections: [
					{ id: 'moment', title: 'The moment', webBody: '1945: The camp is liberated.', sourceIds: ['wikimedia-event'] },
					{ id: 'why-it-matters', title: 'Why it matters', webBody: 'It exposes the scale of the camp.', sourceIds: ['wikipedia-summary'] },
					{ id: 'context', title: 'Context', webBody: 'Background only.', sourceIds: ['wikipedia-summary'] },
					{ id: 'aftermath', title: 'Aftermath', webBody: 'Page 4 Atrocity Stories Multiply Daily', sourceIds: ['loc-archive'] },
					{ id: 'artifact', title: 'Artifact', webBody: 'Artifact text.', sourceIds: ['open-library'] },
				],
			}),
		).toThrow();
	});

	it('falls back field-by-field when generated prose contains banned formatting noise', () => {
		const response = buildArtifactResponse({
			dateUtc: '2026-04-22',
			key: '04-22',
			generatedAt: '2026-04-22T00:00:00.000Z',
			isFallback: false,
			candidate: {
				year: 1945,
				text: 'World War II: Sachsenhausen concentration camp is liberated by soldiers of the Red Army and Polish First Army.',
				pages: [
					{
						title: 'Sachsenhausen concentration camp',
						normalizedTitle: 'Sachsenhausen_concentration_camp',
						description: 'Nazi concentration camp in Oranienburg',
						extract: 'Sachsenhausen was a Nazi concentration camp in Oranienburg, Germany.',
						contentUrl: 'https://en.wikipedia.org/wiki/Sachsenhausen_concentration_camp',
					},
				],
			},
			enrichment: {
				summary: 'Sachsenhausen was a Nazi concentration camp in Oranienburg, Germany.',
				locSnippet: {
					title: 'Historical archive',
					url: 'https://loc.gov/example',
					snippet: 'Contemporary coverage described the camp liberation and the evidence found there.',
				},
			},
			sources: [
				{
					id: 'wikimedia-event',
					kind: 'wikimedia-event',
					label: 'Wikimedia event (1945)',
					url: 'https://en.wikipedia.org/wiki/Sachsenhausen_concentration_camp',
					note: 'Event note',
				},
				{
					id: 'wikipedia-summary',
					kind: 'wikipedia-summary',
					label: 'Wikipedia summary: Sachsenhausen concentration camp',
					url: 'https://en.wikipedia.org/wiki/Sachsenhausen_concentration_camp',
					note: 'Summary note',
				},
				{
					id: 'loc-archive',
					kind: 'loc-archive',
					label: 'Historical archive',
					url: 'https://loc.gov/example',
					note: 'Archive note',
				},
			],
			scoring: {
				retention: 84,
				obscurity: 58,
				weirdness: 49,
				compressibility: 72,
				confidence: 88,
			},
			writerDraft: {
				slug: 'sachsenhausen-liberated',
				title: 'World War II: Sachsenhausen concentration camp is liberated',
				deck: 'A sharp historical curiosity from 04-22, optimized for one compelling minute on glasses.',
				summary: 'Sachsenhausen or Sachsenhausen-Oranienburg was a Nazi concentration camp in Oranienburg, Germany.',
				taxonomy: { categories: ['Conflict'] },
				scoring: {
					retention: 84,
					obscurity: 58,
					weirdness: 49,
					compressibility: 72,
					confidence: 88,
				},
				sections: [
					{ id: 'moment', title: 'The Moment', webBody: '1945: World War II: Sachsenhausen concentration camp is liberated by soldiers of the Red Army and Polish First Army.', sourceIds: ['wikimedia-event'] },
					{ id: 'why-it-matters', title: 'Why it matters', webBody: 'The liberation exposed the camp system to the advancing Allies.', sourceIds: ['wikipedia-summary'] },
					{ id: 'context', title: 'Context', webBody: 'Sachsenhausen concentration camp\n\nSachsenhausen was a Nazi concentration camp in Oranienburg, Germany.', sourceIds: ['wikipedia-summary'] },
					{ id: 'aftermath', title: 'Aftermath', webBody: 'Page 4 Atrocity Stories Multiply Daily These are extracts from six newspaper accounts.', sourceIds: ['loc-archive'] },
					{ id: 'artifact', title: 'Artifact', webBody: '"A survivor later recalled the silence after liberation."', sourceIds: ['loc-archive'] },
				],
			},
		});

		expect(response.fact.deck).toBe('Nazi concentration camp in Oranienburg');
		expect(response.fact.summary).toBe('Sachsenhausen or Sachsenhausen-Oranienburg was a Nazi concentration camp in Oranienburg, Germany.');
		expect(response.fact.sections.find((section) => section.id === 'why-it-matters')?.webBody).toBe(
			'The liberation exposed the camp system to the advancing Allies.',
		);
		expect(response.fact.sections.find((section) => section.id === 'context')?.webBody).toBe(
			'Sachsenhausen concentration camp was part of Nazi concentration camp in Oranienburg. Sachsenhausen was a Nazi concentration camp in Oranienburg, Germany.',
		);
		expect(response.fact.sections.find((section) => section.id === 'aftermath')?.webBody).toBe(
			'Contemporary coverage described the camp liberation and the evidence found there.',
		);
		expect(response.fact.sections.find((section) => section.id === 'artifact')?.webBody).toBe(
			'"A survivor later recalled the silence after liberation."',
		);
	});

	it('cleans noisy Library of Congress snippets before they reach the writer', async () => {
		expect(
			cleanLocSnippet(
				'Page 4 Atrocity Stories Multiply Daily These are extracts from six newspaper accounts of Nazi atrocities. The damning evidence mounts from day to day. During the past few days additional reports have been made public on the extermination of Jews in Buchenwald and in the Sachsenhausen concentration camp in Germany. Three French survivors described the terrible plight of the Jews.',
			),
		).toBe(
			'These are extracts from six newspaper accounts of Nazi atrocities.',
		);

		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			createJsonResponse({
				results: [
					{
						title: ['Historical archive'],
						url: ['https://loc.gov/example'],
						description: [
							'Page 4 Atrocity Stories Multiply Daily These are extracts from six newspaper accounts of Nazi atrocities. The damning evidence mounts from day to day.',
						],
						date: '1945-04-22',
					},
				],
			}),
		);

		const snippet = await fetchLocSnippet('Sachsenhausen concentration camp', 1945);
		expect(snippet?.snippet).toBe('These are extracts from six newspaper accounts of Nazi atrocities.');
	});
});
