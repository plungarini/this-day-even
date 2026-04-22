import type { ArtifactEnrichment, HeroImage, WikimediaCandidate, WikimediaCandidatePage } from '../../shared/types';

const USER_AGENT = 'This Day Even App (https://github.com/plungarini/this-day-even)';

function defaultHeaders() {
	return {
		Accept: 'application/json',
		'Api-User-Agent': USER_AGENT,
		'User-Agent': USER_AGENT,
	};
}

async function fetchJson<T>(url: string): Promise<T> {
	const response = await fetch(url, { headers: defaultHeaders() });
	if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
	return (await response.json()) as T;
}

async function fetchJsonWithFallback<T>(urls: string[]): Promise<T> {
	let lastError: unknown;
	for (const url of urls) {
		try {
			return await fetchJson<T>(url);
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError instanceof Error ? lastError : new Error('All source endpoints failed');
}

function normalizeTitle(title: string): string {
	return title.trim().replace(/\s+/g, '_');
}

function normalizePage(page: Record<string, unknown>): WikimediaCandidatePage {
	const title = String(page.title ?? page.normalizedtitle ?? 'Unknown page');
	const thumbnail = page.thumbnail as Record<string, unknown> | undefined;
	const contentUrls = page.content_urls as Record<string, unknown> | undefined;
	const desktopUrls = contentUrls?.desktop as Record<string, unknown> | undefined;
	return {
		title,
		normalizedTitle: normalizeTitle(title),
		description: typeof page.description === 'string' ? page.description : undefined,
		extract: typeof page.extract === 'string' ? page.extract : undefined,
		thumbnailUrl: typeof thumbnail?.source === 'string' ? String(thumbnail.source) : undefined,
		contentUrl: typeof desktopUrls?.page === 'string' ? String(desktopUrls.page) : undefined,
	};
}

function normalizeCandidate(entry: Record<string, unknown>): WikimediaCandidate {
	const pages = Array.isArray(entry.pages) ? entry.pages.map((page) => normalizePage(page as Record<string, unknown>)) : [];
	return {
		year: Number(entry.year ?? 0),
		text: String(entry.text ?? '').trim(),
		pages,
	};
}

function parseWikimediaResponse(payload: unknown): WikimediaCandidate[] {
	if (Array.isArray(payload)) {
		return payload.map((item) => normalizeCandidate(item as Record<string, unknown>));
	}
	if (payload && typeof payload === 'object') {
		const asRecord = payload as Record<string, unknown>;
		if (Array.isArray(asRecord.events)) {
			return asRecord.events.map((item) => normalizeCandidate(item as Record<string, unknown>));
		}
		if (Array.isArray(asRecord.onthisday)) {
			return asRecord.onthisday
				.flatMap((group) => {
					const record = group as Record<string, unknown>;
					return Array.isArray(record.events) ? record.events : [];
				})
				.map((item) => normalizeCandidate(item as Record<string, unknown>));
		}
	}
	return [];
}

export async function fetchWikimediaCandidates(date: Date): Promise<WikimediaCandidate[]> {
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	const year = date.getUTCFullYear();
	const payload = await fetchJsonWithFallback<unknown>([
		`https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${month}/${day}`,
		`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`,
		`https://api.wikimedia.org/feed/v1/wikipedia/en/featured/${year}/${month}/${day}`,
		`https://en.wikipedia.org/api/rest_v1/feed/featured/${year}/${month}/${day}`,
	]);
	return parseWikimediaResponse(payload)
		.filter((candidate) => candidate.year > 0 && candidate.text.length > 0)
		.filter((candidate, index, list) => list.findIndex((item) => item.year === candidate.year && item.text === candidate.text) === index);
}

function buildHeroImage(summary: Record<string, unknown>, fallbackTitle: string): HeroImage | undefined {
	const thumbnail = (summary.thumbnail as Record<string, unknown> | undefined) ?? (summary.originalimage as Record<string, unknown> | undefined);
	if (!thumbnail?.source || !thumbnail.width || !thumbnail.height) return undefined;
	return {
		url: String(thumbnail.source),
		width: Number(thumbnail.width),
		height: Number(thumbnail.height),
		alt: typeof summary.description === 'string' ? String(summary.description) : fallbackTitle,
		credit: `Wikimedia Commons via ${fallbackTitle}`,
	};
}

export async function fetchWikimediaEnrichment(pageTitle: string): Promise<ArtifactEnrichment> {
	const encoded = encodeURIComponent(pageTitle);
	const summary = await fetchJsonWithFallback<Record<string, unknown>>([
		`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
		`https://api.wikimedia.org/core/v1/wikipedia/en/page/${encoded}/description`,
	]);
	return {
		summary: typeof summary.extract === 'string' ? String(summary.extract) : undefined,
		description: typeof summary.description === 'string' ? String(summary.description) : undefined,
		heroImage: buildHeroImage(summary, pageTitle),
	};
}

export async function fetchLocSnippet(query: string, year: number): Promise<ArtifactEnrichment['locSnippet']> {
	try {
		const url = `https://www.loc.gov/search/?fo=json&fa=partof:chronicling+america&q=${encodeURIComponent(query)}`;
		const payload = await fetchJson<Record<string, unknown>>(url);
		const results = Array.isArray(payload.results) ? (payload.results as Array<Record<string, unknown>>) : [];
		const match = results.find((item) => {
			const nestedItem = item.item as Record<string, unknown> | undefined;
			const dateText = JSON.stringify(item.date ?? nestedItem?.date ?? '');
			return dateText.includes(String(year));
		}) ?? results[0];
		if (!match) return undefined;

		const descriptionArray = Array.isArray(match.description) ? match.description : [];
		const description = descriptionArray.length > 0 ? String(descriptionArray[0]) : '';
		const title = Array.isArray(match.title) ? String(match.title[0]) : String(match.title ?? 'Historical archive');
		const itemUrl = Array.isArray(match.url) ? String(match.url[0]) : String(match.url ?? '');
		if (!itemUrl) return undefined;

		return {
			title,
			url: itemUrl,
			snippet: description || `Archived newspaper context linked to ${query}.`,
		};
	} catch {
		return undefined;
	}
}

export async function fetchOpenLibrary(title: string): Promise<ArtifactEnrichment['openLibrary']> {
	try {
		const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1&fields=key,title,author_name,first_publish_year`;
		const payload = await fetchJson<Record<string, unknown>>(url);
		const docs = Array.isArray(payload.docs) ? (payload.docs as Array<Record<string, unknown>>) : [];
		const first = docs[0];
		if (!first?.key || !first.title) return undefined;
		const authorNames = Array.isArray(first.author_name) ? first.author_name : [];
		return {
			title: String(first.title),
			url: `https://openlibrary.org${String(first.key)}`,
			author: authorNames[0] ? String(authorNames[0]) : undefined,
			year: typeof first.first_publish_year === 'number' ? first.first_publish_year : undefined,
		};
	} catch {
		return undefined;
	}
}
