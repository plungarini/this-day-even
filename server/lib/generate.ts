import { addUtcDays, toMonthDayKey, toUtcDateString } from '../../shared/utc';
import type { ArtifactEnrichment, SourceRecord, TodayResponse, WikimediaCandidate } from '../../shared/types';
import { scoreCandidatesWithModel, writeArtifactWithModel } from './openrouter';
import { buildArtifactResponse, buildMinimalFallback, chooseWinner, shortlistCandidates } from './seed';
import { fetchLocSnippet, fetchOpenLibrary, fetchWikimediaCandidates, fetchWikimediaEnrichment } from './source-providers';
import { deleteStoredArtifact, readStoredArtifact, writeStoredArtifact } from './storage';

export interface WorkerBindings {
	THIS_DAY_KV?: KVNamespace;
	THIS_DAY_DB?: D1Database;
	OPENROUTER_API_KEY?: string;
	OPENROUTER_SCORER_MODEL?: string;
	OPENROUTER_WRITER_MODEL?: string;
	OPENROUTER_SCORER_THINKING?: string;
	OPENROUTER_WRITER_THINKING?: string;
	APP_BASE_URL?: string;
	APP_NAME?: string;
	ACCESS_PHASE?: 'free' | 'gated';
	TRIAL_DAYS?: string;
	PAYMENTS_PROVIDER?: string;
}

function leadTitle(candidate: WikimediaCandidate): string {
	return candidate.pages.find((page) => !page.title.startsWith('List of'))?.title ?? candidate.pages[0]?.title ?? 'History';
}

function buildSourceCatalog(candidate: WikimediaCandidate, enrichment: ArtifactEnrichment): SourceRecord[] {
	const lead = candidate.pages.find((page) => !page.title.startsWith('List of')) ?? candidate.pages[0];
	const sources: SourceRecord[] = [
		{
			id: 'wikimedia-event',
			kind: 'wikimedia-event',
			label: `Wikimedia event (${candidate.year})`,
			url: lead?.contentUrl || 'https://en.wikipedia.org/wiki/Main_Page',
			note: candidate.text,
		},
	];

	if (lead?.contentUrl) {
		sources.push({
			id: 'wikipedia-summary',
			kind: 'wikipedia-summary',
			label: `Wikipedia summary: ${lead.title}`,
			url: lead.contentUrl,
			note: enrichment.summary || enrichment.description,
		});
	}

	if (enrichment.heroImage) {
		sources.push({
			id: 'wikimedia-image',
			kind: 'wikimedia-image',
			label: 'Wikimedia Commons image',
			url: enrichment.heroImage.url,
			note: enrichment.heroImage.credit,
		});
	}

	if (enrichment.locSnippet) {
		sources.push({
			id: 'loc-archive',
			kind: 'loc-archive',
			label: enrichment.locSnippet.title,
			url: enrichment.locSnippet.url,
			note: enrichment.locSnippet.snippet,
		});
	}

	if (enrichment.openLibrary) {
		sources.push({
			id: 'open-library',
			kind: 'open-library',
			label: enrichment.openLibrary.title,
			url: enrichment.openLibrary.url,
			note: enrichment.openLibrary.author,
		});
	}

	return sources;
}

async function enrichCandidate(candidate: WikimediaCandidate): Promise<ArtifactEnrichment> {
	const title = leadTitle(candidate);
	const [wiki, loc, openLibrary] = await Promise.allSettled([
		fetchWikimediaEnrichment(title),
		fetchLocSnippet(title, candidate.year),
		fetchOpenLibrary(title),
	]);

	return {
		...(wiki.status === 'fulfilled' ? wiki.value : {}),
		locSnippet: loc.status === 'fulfilled' ? loc.value : undefined,
		openLibrary: openLibrary.status === 'fulfilled' ? openLibrary.value : undefined,
	};
}

export async function generateArtifact(env: WorkerBindings, date: Date): Promise<TodayResponse> {
	const dateUtc = toUtcDateString(date);
	const key = toMonthDayKey(date);
	const generatedAt = new Date().toISOString();
	const candidates = shortlistCandidates(await fetchWikimediaCandidates(date));
	if (candidates.length === 0) return buildMinimalFallback(dateUtc, key);

	const scoring = await scoreCandidatesWithModel(env, dateUtc, candidates);
	const picked = chooseWinner(candidates, scoring);
	const enrichment = await enrichCandidate(picked.winner);
	const sources = buildSourceCatalog(picked.winner, enrichment);
	const writerDraft = await writeArtifactWithModel(env, {
		dateUtc,
		winner: picked.winner,
		enrichment,
		sources,
		defaultScoring: picked.scoring,
	});

	return buildArtifactResponse({
		dateUtc,
		key,
		generatedAt,
		candidate: picked.winner,
		enrichment,
		sources,
		scoring: picked.scoring,
		writerDraft,
		isFallback: writerDraft === null,
	});
}

export async function getTodayArtifact(env: WorkerBindings, date = new Date()): Promise<TodayResponse> {
	const key = toMonthDayKey(date);
	const existing = await readStoredArtifact(env, key);
	if (existing) return existing;

	try {
		const generated = await generateArtifact(env, date);
		await writeStoredArtifact(env, key, generated);
		return generated;
	} catch {
		return buildMinimalFallback(toUtcDateString(date), key);
	}
}

export async function regenerateTodayArtifact(env: WorkerBindings, date = new Date()): Promise<TodayResponse> {
	const key = toMonthDayKey(date);
	await deleteStoredArtifact(env, key);
	const generated = await generateArtifact(env, date);
	await writeStoredArtifact(env, key, generated);
	return generated;
}

async function refreshOne(env: WorkerBindings, date: Date): Promise<void> {
	const key = toMonthDayKey(date);
	const previous = await readStoredArtifact(env, key);
	try {
		const generated = await generateArtifact(env, date);
		await writeStoredArtifact(env, key, generated);
	} catch {
		if (previous) return;
		await writeStoredArtifact(env, key, buildMinimalFallback(toUtcDateString(date), key));
	}
}

export async function refreshScheduledArtifacts(env: WorkerBindings, date = new Date()): Promise<void> {
	await Promise.all([refreshOne(env, date), refreshOne(env, addUtcDays(date, 1))]);
}

