import type {
	AccessGrant,
	AccessStatusResponse,
	AppUser,
	CheckoutResponse,
	MeResponse,
	PaywallResponse,
	PaymentEvent,
	ResolvedAccessState,
	SubscriptionRecord,
} from '../../shared/types';
import type { WorkerBindings } from './generate';

const TRIAL_MS_PER_DAY = 86_400_000;
const ACCESS_PHASE_FREE = 'free';
const ACCESS_PHASE_GATED = 'gated';

const schemaStatements = [
	`CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		even_uid TEXT NOT NULL UNIQUE,
		first_seen_at TEXT NOT NULL,
		last_seen_at TEXT NOT NULL,
		trial_started_at TEXT,
		trial_ends_at TEXT,
		access_status TEXT NOT NULL,
		country TEXT,
		device_count INTEGER NOT NULL DEFAULT 0,
		last_device_sn TEXT,
		request_count INTEGER NOT NULL DEFAULT 0
	)`,
	`CREATE TABLE IF NOT EXISTS access_grants (
		id TEXT PRIMARY KEY,
		app_user_id TEXT NOT NULL,
		even_uid TEXT NOT NULL,
		source TEXT NOT NULL,
		status TEXT NOT NULL,
		starts_at TEXT NOT NULL,
		ends_at TEXT NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		subscription_id TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS subscriptions (
		id TEXT PRIMARY KEY,
		app_user_id TEXT NOT NULL,
		even_uid TEXT NOT NULL,
		provider TEXT NOT NULL,
		status TEXT NOT NULL,
		starts_at TEXT NOT NULL,
		ends_at TEXT NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		external_customer_id TEXT,
		external_subscription_id TEXT,
		last_payment_event_id TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS payment_events (
		id TEXT PRIMARY KEY,
		provider TEXT NOT NULL,
		type TEXT NOT NULL,
		received_at TEXT NOT NULL,
		even_uid TEXT,
		app_user_id TEXT,
		external_customer_id TEXT,
		external_subscription_id TEXT,
		payload_json TEXT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS request_events (
		id TEXT PRIMARY KEY,
		even_uid TEXT NOT NULL,
		endpoint TEXT NOT NULL,
		result TEXT NOT NULL,
		timestamp TEXT NOT NULL,
		app_version TEXT,
		device_sn TEXT
	)`,
	'CREATE INDEX IF NOT EXISTS idx_access_grants_even_uid ON access_grants(even_uid, ends_at)',
	'CREATE INDEX IF NOT EXISTS idx_subscriptions_even_uid ON subscriptions(even_uid, ends_at)',
	'CREATE INDEX IF NOT EXISTS idx_request_events_even_uid ON request_events(even_uid, timestamp)',
];

type StorageEnv = {
	THIS_DAY_DB?: D1Database;
};

type RequestOutcome = 'served' | 'trial' | 'denied' | 'fallback' | 'free';

export interface IdentityContext {
	evenUid: string | null;
	country?: string;
	deviceSn?: string;
}

export interface WebhookPayload {
	id: string;
	provider: string;
	type: string;
	evenUid?: string;
	externalCustomerId?: string;
	externalSubscriptionId?: string;
	startsAt?: string;
	endsAt?: string;
	status?: string;
	payload?: Record<string, unknown>;
}

interface D1UserRow {
	id: string;
	even_uid: string;
	first_seen_at: string;
	last_seen_at: string;
	trial_started_at: string | null;
	trial_ends_at: string | null;
	access_status: AppUser['accessStatus'];
	country: string | null;
	device_count: number;
	last_device_sn: string | null;
	request_count: number;
}

interface D1GrantRow {
	id: string;
	app_user_id: string;
	even_uid: string;
	source: AccessGrant['source'];
	status: AccessGrant['status'];
	starts_at: string;
	ends_at: string;
	created_at: string;
	updated_at: string;
	subscription_id: string | null;
}

interface D1SubscriptionRow {
	id: string;
	app_user_id: string;
	even_uid: string;
	provider: string;
	status: SubscriptionRecord['status'];
	starts_at: string;
	ends_at: string;
	created_at: string;
	updated_at: string;
	external_customer_id: string | null;
	external_subscription_id: string | null;
	last_payment_event_id: string | null;
}

interface D1PaymentEventRow {
	id: string;
	provider: string;
	type: string;
	received_at: string;
	even_uid: string | null;
	app_user_id: string | null;
	external_customer_id: string | null;
	external_subscription_id: string | null;
	payload_json: string;
}

let schemaInitPromise: Promise<void> | null = null;

const memoryUsers = new Map<string, AppUser>();
const memoryGrants = new Map<string, AccessGrant[]>();
const memorySubscriptions = new Map<string, SubscriptionRecord[]>();
const memoryPaymentEvents = new Map<string, PaymentEvent>();
const memoryRequestEvents = new Map<string, Record<string, unknown>>();

function parseIntOrDefault(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function paymentEventStorageId(provider: string, eventId: string): string {
	return `${provider}:${eventId}`;
}

function accessPhase(env: WorkerBindings): 'free' | 'gated' {
	return env.ACCESS_PHASE === ACCESS_PHASE_GATED ? ACCESS_PHASE_GATED : ACCESS_PHASE_FREE;
}

export function buildFreeAccessState(): ResolvedAccessState {
	return {
		phase: 'free',
		state: 'free',
		source: 'free_phase',
		accessAllowed: true,
		trialStartedAt: null,
		trialEndsAt: null,
		activeUntil: null,
		appUserId: null,
		evenUid: null,
	};
}

function trialDays(env: WorkerBindings): number {
	return parseIntOrDefault(env.TRIAL_DAYS, 7);
}

async function ensureSchema(env: StorageEnv): Promise<void> {
	if (!env.THIS_DAY_DB) return;
	if (!schemaInitPromise) {
		schemaInitPromise = (async () => {
			for (const statement of schemaStatements) {
				await env.THIS_DAY_DB!.prepare(statement).run();
			}
		})();
	}
	await schemaInitPromise;
}

function normalizeEvenUid(evenUid: string | null | undefined): string | null {
	const trimmed = `${evenUid ?? ''}`.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function buildTrialWindow(nowIso: string, days: number): { trialStartedAt: string; trialEndsAt: string } {
	const now = new Date(nowIso);
	return {
		trialStartedAt: nowIso,
		trialEndsAt: new Date(now.getTime() + days * TRIAL_MS_PER_DAY).toISOString(),
	};
}

function mapUserRow(row: D1UserRow): AppUser {
	return {
		id: row.id,
		evenUid: row.even_uid,
		firstSeenAt: row.first_seen_at,
		lastSeenAt: row.last_seen_at,
		trialStartedAt: row.trial_started_at,
		trialEndsAt: row.trial_ends_at,
		accessStatus: row.access_status,
		country: row.country ?? undefined,
		deviceCount: row.device_count,
		lastDeviceSn: row.last_device_sn ?? undefined,
		requestCount: row.request_count,
	};
}

function mapGrantRow(row: D1GrantRow): AccessGrant {
	return {
		id: row.id,
		appUserId: row.app_user_id,
		evenUid: row.even_uid,
		source: row.source,
		status: row.status,
		startsAt: row.starts_at,
		endsAt: row.ends_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		subscriptionId: row.subscription_id ?? undefined,
	};
}

function mapSubscriptionRow(row: D1SubscriptionRow): SubscriptionRecord {
	return {
		id: row.id,
		appUserId: row.app_user_id,
		evenUid: row.even_uid,
		provider: row.provider,
		status: row.status,
		startsAt: row.starts_at,
		endsAt: row.ends_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		externalCustomerId: row.external_customer_id ?? undefined,
		externalSubscriptionId: row.external_subscription_id ?? undefined,
		lastPaymentEventId: row.last_payment_event_id ?? undefined,
	};
}

async function readUser(env: StorageEnv, evenUid: string): Promise<AppUser | null> {
	if (!env.THIS_DAY_DB) return memoryUsers.get(evenUid) ?? null;
	await ensureSchema(env);
	const row = await env.THIS_DAY_DB.prepare('SELECT * FROM users WHERE even_uid = ?1 LIMIT 1').bind(evenUid).first<D1UserRow>();
	return row ? mapUserRow(row) : null;
}

async function writeUser(env: StorageEnv, user: AppUser): Promise<void> {
	if (!env.THIS_DAY_DB) {
		memoryUsers.set(user.evenUid, user);
		return;
	}
	await ensureSchema(env);
	await env.THIS_DAY_DB.prepare(
		`INSERT INTO users (id, even_uid, first_seen_at, last_seen_at, trial_started_at, trial_ends_at, access_status, country, device_count, last_device_sn, request_count)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
		ON CONFLICT(even_uid) DO UPDATE SET
			last_seen_at = excluded.last_seen_at,
			trial_started_at = excluded.trial_started_at,
			trial_ends_at = excluded.trial_ends_at,
			access_status = excluded.access_status,
			country = excluded.country,
			device_count = excluded.device_count,
			last_device_sn = excluded.last_device_sn,
			request_count = excluded.request_count`
	)
		.bind(
			user.id,
			user.evenUid,
			user.firstSeenAt,
			user.lastSeenAt,
			user.trialStartedAt,
			user.trialEndsAt,
			user.accessStatus,
			user.country ?? null,
			user.deviceCount ?? 0,
			user.lastDeviceSn ?? null,
			user.requestCount ?? 0,
		)
		.run();
}

async function listAccessGrants(env: StorageEnv, evenUid: string): Promise<AccessGrant[]> {
	if (!env.THIS_DAY_DB) return [...(memoryGrants.get(evenUid) ?? [])];
	await ensureSchema(env);
	const result = await env.THIS_DAY_DB.prepare('SELECT * FROM access_grants WHERE even_uid = ?1 ORDER BY ends_at DESC').bind(evenUid).all<D1GrantRow>();
	return (result.results ?? []).map(mapGrantRow);
}

async function writeAccessGrant(env: StorageEnv, grant: AccessGrant): Promise<void> {
	if (!env.THIS_DAY_DB) {
		const existing = memoryGrants.get(grant.evenUid) ?? [];
		const next = existing.filter((item) => item.id !== grant.id);
		next.push(grant);
		memoryGrants.set(grant.evenUid, next);
		return;
	}
	await ensureSchema(env);
	await env.THIS_DAY_DB.prepare(
		`INSERT INTO access_grants (id, app_user_id, even_uid, source, status, starts_at, ends_at, created_at, updated_at, subscription_id)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
		ON CONFLICT(id) DO UPDATE SET
			status = excluded.status,
			starts_at = excluded.starts_at,
			ends_at = excluded.ends_at,
			updated_at = excluded.updated_at,
			subscription_id = excluded.subscription_id`
	)
		.bind(
			grant.id,
			grant.appUserId,
			grant.evenUid,
			grant.source,
			grant.status,
			grant.startsAt,
			grant.endsAt,
			grant.createdAt,
			grant.updatedAt,
			grant.subscriptionId ?? null,
		)
		.run();
}

async function listSubscriptions(env: StorageEnv, evenUid: string): Promise<SubscriptionRecord[]> {
	if (!env.THIS_DAY_DB) return [...(memorySubscriptions.get(evenUid) ?? [])];
	await ensureSchema(env);
	const result = await env.THIS_DAY_DB.prepare('SELECT * FROM subscriptions WHERE even_uid = ?1 ORDER BY ends_at DESC').bind(evenUid).all<D1SubscriptionRow>();
	return (result.results ?? []).map(mapSubscriptionRow);
}

async function writeSubscription(env: StorageEnv, subscription: SubscriptionRecord): Promise<void> {
	if (!env.THIS_DAY_DB) {
		const existing = memorySubscriptions.get(subscription.evenUid) ?? [];
		const next = existing.filter((item) => item.id !== subscription.id);
		next.push(subscription);
		memorySubscriptions.set(subscription.evenUid, next);
		return;
	}
	await ensureSchema(env);
	await env.THIS_DAY_DB.prepare(
		`INSERT INTO subscriptions (id, app_user_id, even_uid, provider, status, starts_at, ends_at, created_at, updated_at, external_customer_id, external_subscription_id, last_payment_event_id)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
		ON CONFLICT(id) DO UPDATE SET
			status = excluded.status,
			starts_at = excluded.starts_at,
			ends_at = excluded.ends_at,
			updated_at = excluded.updated_at,
			external_customer_id = excluded.external_customer_id,
			external_subscription_id = excluded.external_subscription_id,
			last_payment_event_id = excluded.last_payment_event_id`
	)
		.bind(
			subscription.id,
			subscription.appUserId,
			subscription.evenUid,
			subscription.provider,
			subscription.status,
			subscription.startsAt,
			subscription.endsAt,
			subscription.createdAt,
			subscription.updatedAt,
			subscription.externalCustomerId ?? null,
			subscription.externalSubscriptionId ?? null,
			subscription.lastPaymentEventId ?? null,
		)
		.run();
}

async function readPaymentEvent(env: StorageEnv, provider: string, eventId: string): Promise<PaymentEvent | null> {
	const storageId = paymentEventStorageId(provider, eventId);
	if (!env.THIS_DAY_DB) return memoryPaymentEvents.get(storageId) ?? null;
	await ensureSchema(env);
	const row = await env.THIS_DAY_DB.prepare('SELECT * FROM payment_events WHERE id = ?1 LIMIT 1').bind(storageId).first<D1PaymentEventRow>();
	if (!row) return null;
	return {
		id: eventId,
		provider: row.provider,
		type: row.type,
		receivedAt: row.received_at,
		evenUid: row.even_uid ?? undefined,
		appUserId: row.app_user_id ?? undefined,
		externalCustomerId: row.external_customer_id ?? undefined,
		externalSubscriptionId: row.external_subscription_id ?? undefined,
		payload: JSON.parse(row.payload_json) as Record<string, unknown>,
	};
}

async function writePaymentEvent(env: StorageEnv, event: PaymentEvent): Promise<void> {
	const storageId = paymentEventStorageId(event.provider, event.id);
	if (!env.THIS_DAY_DB) {
		memoryPaymentEvents.set(storageId, event);
		return;
	}
	await ensureSchema(env);
	await env.THIS_DAY_DB.prepare(
		`INSERT INTO payment_events (id, provider, type, received_at, even_uid, app_user_id, external_customer_id, external_subscription_id, payload_json)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
		ON CONFLICT(id) DO NOTHING`
	)
		.bind(
			storageId,
			event.provider,
			event.type,
			event.receivedAt,
			event.evenUid ?? null,
			event.appUserId ?? null,
			event.externalCustomerId ?? null,
			event.externalSubscriptionId ?? null,
			JSON.stringify(event.payload),
		)
		.run();
}

async function writeRequestEvent(
	env: StorageEnv,
	event: { id: string; evenUid: string; endpoint: string; result: RequestOutcome; timestamp: string; appVersion?: string; deviceSn?: string },
): Promise<void> {
	if (!env.THIS_DAY_DB) {
		memoryRequestEvents.set(event.id, event);
		return;
	}
	await ensureSchema(env);
	await env.THIS_DAY_DB.prepare(
		`INSERT INTO request_events (id, even_uid, endpoint, result, timestamp, app_version, device_sn)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
	)
		.bind(event.id, event.evenUid, event.endpoint, event.result, event.timestamp, event.appVersion ?? null, event.deviceSn ?? null)
		.run();
}

function mapUserAccessStatus(user: AppUser, grants: AccessGrant[], now = new Date()): AppUser['accessStatus'] {
	const nowMs = now.getTime();
	const activeGrant = grants.find((grant) => grant.status === 'active' && new Date(grant.endsAt).getTime() >= nowMs);
	if (activeGrant) return activeGrant.source === 'trial' ? 'trial' : 'active';
	if (grants.some((grant) => grant.status === 'grace' && new Date(grant.endsAt).getTime() >= nowMs)) return 'grace';
	if (user.trialEndsAt && new Date(user.trialEndsAt).getTime() < nowMs) return 'expired';
	return 'free';
}

export async function getOrCreateUser(env: WorkerBindings, identity: IdentityContext, now = new Date()): Promise<AppUser | null> {
	const evenUid = normalizeEvenUid(identity.evenUid);
	if (!evenUid) return null;

	const nowIso = now.toISOString();
	const existing = await readUser(env, evenUid);
	if (existing) {
		const next: AppUser = {
			...existing,
			lastSeenAt: nowIso,
			country: identity.country ?? existing.country,
			lastDeviceSn: identity.deviceSn ?? existing.lastDeviceSn,
			deviceCount: existing.deviceCount ?? (identity.deviceSn ? 1 : 0),
			requestCount: (existing.requestCount ?? 0) + 1,
		};
		await writeUser(env, next);
		return next;
	}

	const trialWindow = buildTrialWindow(nowIso, trialDays(env));
	const created: AppUser = {
		id: crypto.randomUUID(),
		evenUid,
		firstSeenAt: nowIso,
		lastSeenAt: nowIso,
		trialStartedAt: trialWindow.trialStartedAt,
		trialEndsAt: trialWindow.trialEndsAt,
		accessStatus: 'trial',
		country: identity.country,
		lastDeviceSn: identity.deviceSn,
		deviceCount: identity.deviceSn ? 1 : 0,
		requestCount: 1,
	};
	await writeUser(env, created);

	const trialGrant: AccessGrant = {
		id: crypto.randomUUID(),
		appUserId: created.id,
		evenUid,
		source: 'trial',
		status: 'active',
		startsAt: trialWindow.trialStartedAt,
		endsAt: trialWindow.trialEndsAt,
		createdAt: nowIso,
		updatedAt: nowIso,
	};
	await writeAccessGrant(env, trialGrant);
	return created;
}

export async function resolveAccess(env: WorkerBindings, identity: IdentityContext, now = new Date()): Promise<ResolvedAccessState> {
	const phase = accessPhase(env);
	const user = await getOrCreateUser(env, identity, now);
	if (!user) {
		return {
			phase,
			state: 'free',
			source: 'free_phase',
			accessAllowed: true,
			trialStartedAt: null,
			trialEndsAt: null,
			activeUntil: null,
			appUserId: null,
			evenUid: null,
		};
	}

	const nowMs = now.getTime();
	const grants = await listAccessGrants(env, user.evenUid);
	const subscriptions = await listSubscriptions(env, user.evenUid);
	const activeGrant = grants.find((grant) => grant.status === 'active' && new Date(grant.endsAt).getTime() >= nowMs);
	const pastDueSubscription = subscriptions.find((subscription) => subscription.status === 'past_due' && new Date(subscription.endsAt).getTime() >= nowMs);

	let state: ResolvedAccessState['state'] = 'trial_expired';
	let source: ResolvedAccessState['source'] = 'none';
	let activeUntil: string | null = null;
	let accessAllowed = false;

	if (activeGrant) {
		activeUntil = activeGrant.endsAt;
		if (activeGrant.source === 'trial') {
			state = 'trial_active';
			source = 'trial';
		} else {
			state = 'subscription_active';
			source = 'subscription';
		}
		accessAllowed = true;
	} else if (pastDueSubscription) {
		state = 'subscription_past_due';
		source = 'subscription';
		activeUntil = pastDueSubscription.endsAt;
		accessAllowed = phase === ACCESS_PHASE_FREE;
	} else if (phase === ACCESS_PHASE_FREE) {
		state = user.trialEndsAt && new Date(user.trialEndsAt).getTime() >= nowMs ? 'trial_active' : 'trial_expired';
		source = 'free_phase';
		accessAllowed = true;
	} else {
		state = 'no_access';
		source = 'none';
		accessAllowed = false;
	}

	const nextUser: AppUser = {
		...user,
		accessStatus: mapUserAccessStatus(user, grants, now),
	};
	await writeUser(env, nextUser);

	return {
		phase,
		state,
		source,
		accessAllowed,
		trialStartedAt: nextUser.trialStartedAt,
		trialEndsAt: nextUser.trialEndsAt,
		activeUntil,
		appUserId: nextUser.id,
		evenUid: nextUser.evenUid,
	};
}

export async function recordRequestEvent(
	env: WorkerBindings,
	identity: IdentityContext,
	outcome: RequestOutcome,
	endpoint: string,
	appVersion?: string,
	now = new Date(),
): Promise<void> {
	const evenUid = normalizeEvenUid(identity.evenUid);
	if (!evenUid) return;

	await writeRequestEvent(env, {
		id: crypto.randomUUID(),
		evenUid,
		endpoint,
		result: outcome,
		timestamp: now.toISOString(),
		appVersion,
		deviceSn: identity.deviceSn,
	});
}

function toAccessStatusResponse(access: ResolvedAccessState): AccessStatusResponse {
	return {
		phase: access.phase,
		state: access.state,
		accessAllowed: access.accessAllowed,
		trialStartedAt: access.trialStartedAt,
		trialEndsAt: access.trialEndsAt,
		activeUntil: access.activeUntil,
		appUserId: access.appUserId,
		evenUid: access.evenUid,
	};
}

export async function buildMeResponse(env: WorkerBindings, identity: IdentityContext, now = new Date()): Promise<MeResponse> {
	const access = await resolveAccess(env, identity, now);
	const user = access.evenUid ? await readUser(env, access.evenUid) : null;
	return {
		user: {
			appUserId: user?.id ?? null,
			evenUid: user?.evenUid ?? null,
			country: user?.country,
			lastSeenAt: user?.lastSeenAt,
			firstSeenAt: user?.firstSeenAt,
		},
		access: toAccessStatusResponse(access),
	};
}

export function buildPaywallResponse(access: ResolvedAccessState): PaywallResponse {
	return {
		ok: false,
		error: 'payment_required',
		access: toAccessStatusResponse(access),
		paywall: {
			headline: 'Your free trial has ended.',
			body: 'This Day can later switch to paid monthly access without changing the content contract. Checkout is not active in this environment yet.',
			ctaLabel: 'Unlock monthly access',
		},
	};
}

export async function buildCheckoutResponse(env: WorkerBindings, identity: IdentityContext, now = new Date()): Promise<CheckoutResponse> {
	const access = await resolveAccess(env, identity, now);
	return {
		ok: true,
		provider: env.PAYMENTS_PROVIDER || 'unconfigured',
		message: env.PAYMENTS_PROVIDER
			? 'Payment adapter is configured, but checkout session creation still needs a provider-specific implementation.'
			: 'No payment provider is configured yet. This endpoint is ready for a future crypto billing adapter.',
		access: toAccessStatusResponse(access),
	};
}

export async function ingestPaymentWebhook(env: WorkerBindings, payload: WebhookPayload, now = new Date()): Promise<{ ok: true; duplicate: boolean }> {
	const existing = await readPaymentEvent(env, payload.provider, payload.id);
	if (existing) return { ok: true, duplicate: true };

	const evenUid = normalizeEvenUid(payload.evenUid);
	const user = evenUid ? await getOrCreateUser(env, { evenUid }, now) : null;
	const event: PaymentEvent = {
		id: payload.id,
		provider: payload.provider,
		type: payload.type,
		receivedAt: now.toISOString(),
		evenUid: evenUid ?? undefined,
		appUserId: user?.id,
		externalCustomerId: payload.externalCustomerId,
		externalSubscriptionId: payload.externalSubscriptionId,
		payload: payload.payload ?? {},
	};
	await writePaymentEvent(env, event);

	if (user && payload.externalSubscriptionId && payload.startsAt && payload.endsAt) {
		const normalizedStatus =
			payload.status === 'past_due' || payload.status === 'grace'
				? 'past_due'
				: payload.status === 'canceled'
					? 'canceled'
					: payload.status === 'expired'
						? 'expired'
						: 'active';

		const subscription: SubscriptionRecord = {
			id: payload.externalSubscriptionId,
			appUserId: user.id,
			evenUid: user.evenUid,
			provider: payload.provider,
			status: normalizedStatus,
			startsAt: payload.startsAt,
			endsAt: payload.endsAt,
			createdAt: now.toISOString(),
			updatedAt: now.toISOString(),
			externalCustomerId: payload.externalCustomerId,
			externalSubscriptionId: payload.externalSubscriptionId,
			lastPaymentEventId: payload.id,
		};
		await writeSubscription(env, subscription);

		const grant: AccessGrant = {
			id: crypto.randomUUID(),
			appUserId: user.id,
			evenUid: user.evenUid,
			source: 'crypto_subscription',
			status: normalizedStatus === 'active' ? 'active' : normalizedStatus === 'past_due' ? 'grace' : 'expired',
			startsAt: payload.startsAt,
			endsAt: payload.endsAt,
			createdAt: now.toISOString(),
			updatedAt: now.toISOString(),
			subscriptionId: subscription.id,
		};
		await writeAccessGrant(env, grant);
	}

	return { ok: true, duplicate: false };
}

export function readIdentityFromHeaders(headers: Headers): IdentityContext {
	const evenUid = normalizeEvenUid(headers.get('X-Even-User-Uid'));
	const country = headers.get('X-Even-User-Country') || undefined;
	const deviceSn = headers.get('X-Even-Device-Sn') || undefined;
	return { evenUid, country, deviceSn };
}

export function __resetAccessStoreForTests(): void {
	schemaInitPromise = null;
	memoryUsers.clear();
	memoryGrants.clear();
	memorySubscriptions.clear();
	memoryPaymentEvents.clear();
	memoryRequestEvents.clear();
}
