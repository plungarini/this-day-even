import type { ArtifactEnrichment, SourceRecord, WikimediaCandidate } from '../../shared/types';
import { scorerResultSchema, type ScorerResult, writerDraftSchema, type WriterDraft, scorerJsonSchema, writerJsonSchema } from './schemas';

interface OpenRouterEnv {
	OPENROUTER_API_KEY?: string;
	OPENROUTER_SCORER_MODEL?: string;
	OPENROUTER_WRITER_MODEL?: string;
	OPENROUTER_SCORER_THINKING?: string;
	OPENROUTER_WRITER_THINKING?: string;
	APP_BASE_URL?: string;
	APP_NAME?: string;
}

function normalizeEffort(value: string | undefined): 'low' | 'medium' | 'high' {
	if (value === 'high') return 'high';
	if (value === 'low') return 'low';
	return 'medium';
}

function extractContent(payload: Record<string, unknown>): string | null {
	const choices = Array.isArray(payload.choices) ? payload.choices : [];
	const first = choices[0] as Record<string, unknown> | undefined;
	const message = first?.message as Record<string, unknown> | undefined;
	const content = message?.content;
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === 'string') return part;
				if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
					return String((part as Record<string, unknown>).text);
				}
				return '';
			})
			.join('');
	}
	return null;
}

async function requestStructuredOutput<T>(
	apiKey: string,
	model: string,
	reasoningEffort: 'low' | 'medium' | 'high',
	messages: Array<{ role: 'system' | 'user'; content: string }>,
	schemaName: string,
	jsonSchema: object,
	parser: (value: unknown) => T,
): Promise<T> {
	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://github.com/plungarini/this-day-even',
			'X-Title': 'This Day',
		},
		body: JSON.stringify({
			model,
			messages,
			reasoning: {
				effort: reasoningEffort,
			},
			response_format: {
				type: 'json_schema',
				json_schema: {
					name: schemaName,
					strict: true,
					schema: jsonSchema,
				},
			},
		}),
	});

	if (!response.ok) {
		throw new Error(`OpenRouter ${response.status}: ${await response.text()}`);
	}

	const payload = (await response.json()) as Record<string, unknown>;
	const content = extractContent(payload);
	if (!content) throw new Error('OpenRouter returned no structured content');
	return parser(JSON.parse(content));
}

export async function scoreCandidatesWithModel(
	env: OpenRouterEnv,
	dateLabel: string,
	candidates: WikimediaCandidate[],
): Promise<ScorerResult | null> {
	if (!env.OPENROUTER_API_KEY) return null;
	try {
		return await requestStructuredOutput(
			env.OPENROUTER_API_KEY,
			env.OPENROUTER_SCORER_MODEL || 'google/gemini-3.1-flash-lite-preview',
			normalizeEffort(env.OPENROUTER_SCORER_THINKING),
			[
				{
					role: 'system',
					content:
						'You are ranking historical events for an addictive daily history ritual on Even Realities smart glasses. Favor the event that is obscure, specific, vivid, memorable, and easy to compress into a short sequence of sections. Reject generic textbook filler.',
				},
				{
					role: 'user',
					content: JSON.stringify({
						dateUtc: dateLabel,
						candidates: candidates.map((candidate, index) => ({
							index,
							year: candidate.year,
							text: candidate.text,
							pages: candidate.pages.map((page) => ({
								title: page.title,
								description: page.description,
								extract: page.extract,
							})),
						})),
					}),
				},
			],
			'this_day_candidate_scoring',
			scorerJsonSchema,
			(value) => scorerResultSchema.parse(value),
		);
	} catch {
		return null;
	}
}

export async function writeArtifactWithModel(
	env: OpenRouterEnv,
	input: {
		dateUtc: string;
		winner: WikimediaCandidate;
		enrichment: ArtifactEnrichment;
		sources: SourceRecord[];
		defaultScoring: {
			retention: number;
			obscurity: number;
			weirdness: number;
			compressibility: number;
			confidence: number;
		};
	},
): Promise<WriterDraft | null> {
	if (!env.OPENROUTER_API_KEY) return null;
	try {
		return await requestStructuredOutput(
			env.OPENROUTER_API_KEY,
			env.OPENROUTER_WRITER_MODEL || 'google/gemini-3.1-pro-preview',
			normalizeEffort(env.OPENROUTER_WRITER_THINKING),
			[
				{
					role: 'system',
					content:
						'You are writing final app copy for This Day. Every string you return is shown directly to users in the webview and glasses HUD. Use only the evidence provided. Write vivid, credible English prose that is clean and presentation-ready. Do not write notes for editors, renderers, or other models. Do not mention prompts, sections, cards, pages, daily ritual, optimization, or glasses. Do not include OCR debris, publication headers, pagination markers, bracketed notes, markdown, HTML, raw URLs, hyperlink formatting, or provenance labels such as "Wikipedia summary", "Archive:", "Read later:", "Page 4", or "Image 4 of". Paraphrase source material by default. Short quotes are allowed only when they are brief, readable, and not header-like. Use the exact section ids and exact titles in this order: moment/The Moment, why-it-matters/Why it matters, context/Context, aftermath/Aftermath, artifact/Artifact. Field intent: title = presentation-ready title case; deck = one short editorial subtitle, never a product tagline; summary = one clean factual paragraph with no setup language; webBody = final reading copy only, one or two tight paragraphs, no headings inside the body. Section voice: moment = direct event statement; why-it-matters = interpretive but factual; context = background only; aftermath = consequences only; artifact = a prose lead into what survives to read or view, never a label dump.',
				},
				{
					role: 'user',
					content: JSON.stringify({
						dateUtc: input.dateUtc,
						winner: input.winner,
						enrichment: input.enrichment,
						availableSources: input.sources.map((source) => ({
							id: source.id,
							kind: source.kind,
							label: source.label,
							paraphraseNotes: source.note,
						})),
						defaultScoring: input.defaultScoring,
						requirements: {
							sectionOrder: ['moment', 'why-it-matters', 'context', 'aftermath', 'artifact'],
							maxCategories: 5,
							maxSectionSourceIds: 4,
							exactSectionTitles: {
								moment: 'The Moment',
								'why-it-matters': 'Why it matters',
								context: 'Context',
								aftermath: 'Aftermath',
								artifact: 'Artifact',
							},
						},
					}),
				},
			],
			'this_day_writer_draft',
			writerJsonSchema,
			(value) => writerDraftSchema.parse(value),
		);
	} catch {
		return null;
	}
}

