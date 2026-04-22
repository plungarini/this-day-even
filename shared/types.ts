export type SectionId = 'moment' | 'why-it-matters' | 'context' | 'aftermath' | 'artifact';

export interface SourceRecord {
	id: string;
	kind: 'wikimedia-event' | 'wikipedia-summary' | 'wikimedia-image' | 'loc-archive' | 'open-library' | 'generated';
	label: string;
	url: string;
	note?: string;
}

export interface SourceRef {
	sourceId: string;
	label: string;
}

export interface HeroImage {
	url: string;
	width: number;
	height: number;
	alt: string;
	credit: string;
}

export interface FactScoring {
	retention: number;
	obscurity: number;
	weirdness: number;
	compressibility: number;
	confidence: number;
}

export interface FactSection {
	id: SectionId;
	title: string;
	webBody: string;
	hudPages: string[];
	sourceRefs: SourceRef[];
}

export interface TodayFact {
	slug: string;
	year: number;
	title: string;
	deck: string;
	summary: string;
	heroImage?: HeroImage;
	sections: FactSection[];
	taxonomy: {
		categories: string[];
	};
	scoring: FactScoring;
}

export interface TodayResponse {
	dateUtc: string;
	key: string;
	generatedAt: string;
	isFallback: boolean;
	fact: TodayFact;
	sources: SourceRecord[];
}

export interface WikimediaCandidatePage {
	title: string;
	normalizedTitle: string;
	description?: string;
	extract?: string;
	thumbnailUrl?: string;
	contentUrl?: string;
}

export interface WikimediaCandidate {
	year: number;
	text: string;
	pages: WikimediaCandidatePage[];
}

export interface ArtifactEnrichment {
	summary?: string;
	description?: string;
	heroImage?: HeroImage;
	locSnippet?: {
		title: string;
		url: string;
		snippet: string;
	};
	openLibrary?: {
		title: string;
		url: string;
		author?: string;
		year?: number;
	};
}

