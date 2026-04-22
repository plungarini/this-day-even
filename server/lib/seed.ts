import { paginateHudText } from '../../shared/paginate';
import type { ArtifactEnrichment, FactScoring, SourceRecord, TodayResponse, WikimediaCandidate } from '../../shared/types';
import type { ScorerResult, WriterDraft } from './schemas';
import { isCleanGeneratedProse, sanitizeGeneratedProse } from './schemas';

const SECTION_ORDER = ['moment', 'why-it-matters', 'context', 'aftermath', 'artifact'] as const;
const SECTION_TITLES: Record<(typeof SECTION_ORDER)[number], string> = {
	moment: 'The Moment',
	'why-it-matters': 'Why it matters',
	context: 'Context',
	aftermath: 'Aftermath',
	artifact: 'Artifact',
};

const WEIRD_TERMS = [
	'first',
	'discovers',
	'discovers',
	'isolates',
	'erupts',
	'collapses',
	'mutiny',
	'phantom',
	'strange',
	'accident',
	'disaster',
	'volcano',
	'radium',
	'expedition',
	'storm',
	'transit',
	'cryptic',
];

const BORING_PATTERNS = [/is founded/i, /is elected/i, /opens\b/i, /begins\b/i, /wins\b/i, /launches\b/i];

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function leadPage(candidate: WikimediaCandidate) {
	return candidate.pages.find((page) => !page.title.startsWith('List of')) ?? candidate.pages[0];
}

function sentenceCase(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function displayTitle(value: string | undefined): string {
	if (!value) return 'This event';
	return value
		.replace(/_/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function conciseFactLine(candidate: WikimediaCandidate, enrichment: ArtifactEnrichment): string {
	return displayTitle(enrichment.description || leadPage(candidate)?.description || candidate.text);
}

function cleanWriterField(value: string | undefined): string {
	if (!value) return '';
	return sanitizeGeneratedProse(value);
}

function selectCleanField(primary: string | undefined, fallback: string): string {
	const rawPrimary = primary?.trim() ?? '';
	const cleanedPrimary = cleanWriterField(primary);
	if (rawPrimary && isCleanGeneratedProse(rawPrimary) && cleanedPrimary && isCleanGeneratedProse(cleanedPrimary)) {
		return cleanedPrimary;
	}
	const cleanedFallback = cleanWriterField(fallback);
	return cleanedFallback || fallback.trim();
}

function selectCleanSection(
	writerSection: WriterDraft['sections'][number] | undefined,
	fallback: { title: string; webBody: string; sourceIds: string[] },
) {
	const rawBody = writerSection?.webBody?.trim() ?? '';
	const cleanBody = cleanWriterField(writerSection?.webBody);
	const hasGoodBody = rawBody && isCleanGeneratedProse(rawBody) && cleanBody && isCleanGeneratedProse(cleanBody);
	return {
		title: fallback.title,
		webBody: hasGoodBody ? cleanBody : fallback.webBody,
		sourceIds: hasGoodBody ? writerSection?.sourceIds ?? fallback.sourceIds : fallback.sourceIds,
	};
}

export function heuristicScoreCandidate(candidate: WikimediaCandidate): FactScoring {
	const text = candidate.text.toLowerCase();
	const weirdHits = WEIRD_TERMS.filter((term) => text.includes(term)).length;
	const boringPenalty = BORING_PATTERNS.some((pattern) => pattern.test(candidate.text)) ? 18 : 0;
	const pageBonus = clamp(candidate.pages.length * 6, 0, 18);
	const extractBonus = candidate.pages.some((page) => page.extract) ? 12 : 0;
	const imageBonus = candidate.pages.some((page) => page.thumbnailUrl) ? 8 : 0;
	const specificity = clamp(candidate.text.length / 2.4, 0, 38);
	const weirdness = clamp(35 + weirdHits * 11 + imageBonus - boringPenalty, 15, 96);
	const obscurity = clamp(52 + pageBonus - boringPenalty / 2, 20, 94);
	const retention = clamp(44 + weirdHits * 9 + extractBonus + specificity / 3 - boringPenalty / 2, 25, 97);
	const compressibility = clamp(78 - Math.max(0, candidate.text.length - 120) / 3 + extractBonus / 2, 24, 95);
	const confidence = clamp(55 + extractBonus + imageBonus + pageBonus / 2, 30, 95);
	return {
		retention: Math.round(retention),
		obscurity: Math.round(obscurity),
		weirdness: Math.round(weirdness),
		compressibility: Math.round(compressibility),
		confidence: Math.round(confidence),
	};
}

export function shortlistCandidates(candidates: WikimediaCandidate[]): WikimediaCandidate[] {
	return candidates
		.filter((candidate) => candidate.text.length >= 36)
		.filter((candidate) => !BORING_PATTERNS.some((pattern) => pattern.test(candidate.text)))
		.sort((left, right) => heuristicScoreCandidate(right).retention - heuristicScoreCandidate(left).retention)
		.slice(0, 8);
}

export function chooseWinner(
	candidates: WikimediaCandidate[],
	modelScoring: ScorerResult | null,
): { winner: WikimediaCandidate; scoring: FactScoring } {
	if (candidates.length === 0) throw new Error('No candidates to choose from');
	if (modelScoring) {
		const winner = candidates[modelScoring.winnerIndex] ?? candidates[0];
		const modelWinner = modelScoring.scoredCandidates.find((entry) => entry.index === modelScoring.winnerIndex);
		if (winner && modelWinner) {
			return {
				winner,
				scoring: {
					retention: Math.round(modelWinner.retention),
					obscurity: Math.round(modelWinner.obscurity),
					weirdness: Math.round(modelWinner.weirdness),
					compressibility: Math.round(modelWinner.compressibility),
					confidence: Math.round(modelWinner.confidence),
				},
			};
		}
	}

	const winner = candidates[0];
	return { winner, scoring: heuristicScoreCandidate(winner) };
}

function buildSlug(candidate: WikimediaCandidate): string {
	return `${candidate.year}-${candidate.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)}`;
}

function defaultCategories(candidate: WikimediaCandidate): string[] {
	const lead = leadPage(candidate);
	const values = [
		lead?.description,
		candidate.text.includes('war') ? 'Conflict' : '',
		candidate.text.includes('science') || candidate.text.includes('isolates') ? 'Science' : '',
		candidate.text.includes('disaster') || candidate.text.includes('erupts') ? 'Disaster' : '',
	];
	const categories = values.map((entry) => (entry ? sentenceCase(entry.split(',')[0] ?? entry) : '')).filter(Boolean);
	return Array.from(new Set(categories)).slice(0, 4).length > 0 ? Array.from(new Set(categories)).slice(0, 4) : ['Historical curiosity'];
}

function ensureSectionDraft(
	id: (typeof SECTION_ORDER)[number],
	candidate: WikimediaCandidate,
	enrichment: ArtifactEnrichment,
	sources: SourceRecord[],
): { title: string; webBody: string; sourceIds: string[] } {
	const eventSource = sources.find((source) => source.kind === 'wikimedia-event');
	const summarySource = sources.find((source) => source.kind === 'wikipedia-summary');
	const locSource = sources.find((source) => source.kind === 'loc-archive');
	const bookSource = sources.find((source) => source.kind === 'open-library');
	const lead = leadPage(candidate);

	switch (id) {
		case 'moment':
			return {
				title: SECTION_TITLES.moment,
				webBody: `${candidate.year}: ${candidate.text}`,
				sourceIds: eventSource ? [eventSource.id] : [],
			};
		case 'why-it-matters':
			return {
				title: SECTION_TITLES['why-it-matters'],
				webBody:
					enrichment.summary ||
					lead?.extract ||
					`${candidate.text} The event stands out because it is unusually specific and easy to picture.`,
				sourceIds: [summarySource?.id, eventSource?.id].filter(Boolean) as string[],
			};
		case 'context':
			return {
				title: SECTION_TITLES.context,
				webBody:
					lead?.description
						? `${displayTitle(lead.title)} was part of ${lead.description}. ${lead.extract || ''}`.trim()
						: enrichment.summary || candidate.text,
				sourceIds: [summarySource?.id, eventSource?.id].filter(Boolean) as string[],
			};
		case 'aftermath':
			return {
				title: SECTION_TITLES.aftermath,
				webBody:
					enrichment.locSnippet?.snippet ||
					`The event kept echoing in the reporting and records that followed, especially around ${displayTitle(lead?.title) || 'the people involved'}.`,
				sourceIds: [locSource?.id, summarySource?.id, eventSource?.id].filter(Boolean) as string[],
			};
		case 'artifact':
			return {
				title: SECTION_TITLES.artifact,
				webBody:
					enrichment.openLibrary
						? `${enrichment.openLibrary.title}${enrichment.openLibrary.author ? ` by ${enrichment.openLibrary.author}` : ''} offers a good path deeper.${enrichment.locSnippet ? ` Contemporary coverage also survives in ${enrichment.locSnippet.title}.` : ''}`
						: enrichment.locSnippet
							? `${enrichment.locSnippet.title} preserves contemporary reporting. ${enrichment.locSnippet.snippet}`
							: enrichment.heroImage
								? `A related image survives through Wikimedia Commons via ${lead?.title || 'the lead page'}.`
								: `The artifact trail for this day runs through ${lead?.title || 'the source page'} and the linked research around it.`,
				sourceIds: [bookSource?.id, locSource?.id, summarySource?.id].filter(Boolean) as string[],
			};
	}
}

export function buildArtifactResponse(params: {
	dateUtc: string;
	key: string;
	generatedAt: string;
	candidate: WikimediaCandidate;
	enrichment: ArtifactEnrichment;
	sources: SourceRecord[];
	scoring: FactScoring;
	writerDraft: WriterDraft | null;
	isFallback: boolean;
}): TodayResponse {
	const orderedSections = SECTION_ORDER.map((id) => {
		const fallbackDraft = ensureSectionDraft(id, params.candidate, params.enrichment, params.sources);
		const chosen = selectCleanSection(params.writerDraft?.sections.find((section) => section.id === id), fallbackDraft);
		const labels = chosen.sourceIds
			.map((sourceId) => params.sources.find((source) => source.id === sourceId))
			.filter(Boolean)
			.map((source) => ({
				sourceId: source!.id,
				label: source!.label,
			}));
		return {
			id,
			title: chosen.title,
			webBody: chosen.webBody,
			hudPages: paginateHudText(chosen.webBody),
			sourceRefs: labels,
		};
	});

	return {
		dateUtc: params.dateUtc,
		key: params.key,
		generatedAt: params.generatedAt,
		isFallback: params.isFallback,
		fact: {
			slug: params.writerDraft?.slug || buildSlug(params.candidate),
			year: params.candidate.year,
			title: params.writerDraft?.title || sentenceCase(params.candidate.text),
			deck: selectCleanField(params.writerDraft?.deck, conciseFactLine(params.candidate, params.enrichment)),
			summary: selectCleanField(params.writerDraft?.summary, params.enrichment.summary || params.candidate.text),
			heroImage: params.enrichment.heroImage,
			sections: orderedSections,
			taxonomy: {
				categories: params.writerDraft?.taxonomy.categories || defaultCategories(params.candidate),
			},
			scoring: params.writerDraft?.scoring || params.scoring,
		},
		sources: params.sources,
	};
}

export function buildMinimalFallback(dateUtc: string, key: string): TodayResponse {
	const generatedAt = new Date().toISOString();
	const placeholderText = `This Day could not assemble the live artifact for ${key}.`;
	return {
		dateUtc,
		key,
		generatedAt,
		isFallback: true,
		fact: {
			slug: `${key}-fallback`,
			year: Number(dateUtc.slice(0, 4)),
			title: 'History is reloading',
			deck: 'The daily ritual is still reserved for this date.',
			summary: placeholderText,
			sections: SECTION_ORDER.map((id) => ({
				id,
				title: SECTION_TITLES[id],
				webBody:
					id === 'moment'
						? placeholderText
						: 'The fallback artifact is standing in until the live sources are reachable again.',
				hudPages: [id === 'moment' ? placeholderText : 'The fallback artifact is standing in until the live sources are reachable again.'],
				sourceRefs: [],
			})),
			taxonomy: {
				categories: ['Fallback'],
			},
			scoring: {
				retention: 25,
				obscurity: 25,
				weirdness: 25,
				compressibility: 80,
				confidence: 10,
			},
		},
		sources: [
			{
				id: 'generated-fallback',
				kind: 'generated',
				label: 'Generated fallback',
				url: 'about:blank',
				note: 'Returned because the live generation pipeline could not produce an artifact.',
			},
		],
	};
}

