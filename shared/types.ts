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

export type AccessState =
	| 'free'
	| 'trial_active'
	| 'trial_expired'
	| 'subscription_active'
	| 'subscription_past_due'
	| 'no_access';

export type AccessGrantSource = 'trial' | 'crypto_subscription' | 'manual_grant' | 'promo';

export type AccessGrantStatus = 'active' | 'grace' | 'expired' | 'revoked';

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'expired';

export interface AppUser {
	id: string;
	evenUid: string;
	firstSeenAt: string;
	lastSeenAt: string;
	trialStartedAt: string | null;
	trialEndsAt: string | null;
	accessStatus: 'free' | 'trial' | 'active' | 'grace' | 'expired' | 'blocked';
	country?: string;
	deviceCount?: number;
	lastDeviceSn?: string;
	requestCount?: number;
}

export interface AccessGrant {
	id: string;
	appUserId: string;
	evenUid: string;
	source: AccessGrantSource;
	status: AccessGrantStatus;
	startsAt: string;
	endsAt: string;
	createdAt: string;
	updatedAt: string;
	subscriptionId?: string;
}

export interface SubscriptionRecord {
	id: string;
	appUserId: string;
	evenUid: string;
	provider: string;
	status: SubscriptionStatus;
	startsAt: string;
	endsAt: string;
	createdAt: string;
	updatedAt: string;
	externalCustomerId?: string;
	externalSubscriptionId?: string;
	lastPaymentEventId?: string;
}

export interface PaymentEvent {
	id: string;
	provider: string;
	type: string;
	receivedAt: string;
	evenUid?: string;
	appUserId?: string;
	externalCustomerId?: string;
	externalSubscriptionId?: string;
	payload: Record<string, unknown>;
}

export interface AccessStatusResponse {
	phase: 'free' | 'gated';
	state: AccessState;
	accessAllowed: boolean;
	trialStartedAt: string | null;
	trialEndsAt: string | null;
	activeUntil: string | null;
	appUserId: string | null;
	evenUid: string | null;
}

export interface ResolvedAccessState extends AccessStatusResponse {
	source: 'free_phase' | 'trial' | 'subscription' | 'none';
}

export interface MeResponse {
	user: {
		appUserId: string | null;
		evenUid: string | null;
		country?: string;
		lastSeenAt?: string;
		firstSeenAt?: string;
	};
	access: AccessStatusResponse;
}

export interface CheckoutResponse {
	ok: boolean;
	provider: string;
	checkoutUrl?: string;
	message: string;
	access: AccessStatusResponse;
}

export interface PaywallResponse {
	ok: false;
	error: 'payment_required';
	access: AccessStatusResponse;
	paywall: {
		headline: string;
		body: string;
		ctaLabel: string;
	};
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

