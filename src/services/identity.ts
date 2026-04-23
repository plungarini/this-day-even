import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

const IDENTITY_STORAGE_KEY = 'this-day.identity.v1';
const identityCache = new Map<string, string>();

let bridgePromise: Promise<Awaited<ReturnType<typeof waitForEvenAppBridge>> | null> | null = null;
let initPromise: Promise<void> | null = null;

interface StoredIdentity {
	evenUid?: string;
	country?: string;
}

export interface EvenIdentity {
	evenUid: string | null;
	country?: string;
}

async function getBridge() {
	if (!bridgePromise) {
		bridgePromise = Promise.resolve(waitForEvenAppBridge())
			.then((bridge) => bridge ?? null)
			.catch(() => null);
	}
	return bridgePromise;
}

function readCachedIdentity(): StoredIdentity {
	const raw = identityCache.get(IDENTITY_STORAGE_KEY);
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw) as StoredIdentity;
		return {
			evenUid: parsed.evenUid || undefined,
			country: parsed.country || undefined,
		};
	} catch {
		return {};
	}
}

async function persistIdentity(identity: StoredIdentity): Promise<void> {
	const serialized = JSON.stringify(identity);
	identityCache.set(IDENTITY_STORAGE_KEY, serialized);

	const bridge = await getBridge();
	if (bridge && typeof bridge.setLocalStorage === 'function') {
		void bridge.setLocalStorage(IDENTITY_STORAGE_KEY, serialized).catch(() => {});
	}
}

export async function ensureIdentityReady(): Promise<void> {
	if (!initPromise) {
		initPromise = (async () => {
			console.log('[Identity] hydrating cached identity');
			const bridge = await getBridge();
			if (!bridge || typeof bridge.getLocalStorage !== 'function') {
				console.warn('[Identity] bridge storage unavailable during hydration');
				return;
			}
			const value = await bridge.getLocalStorage(IDENTITY_STORAGE_KEY);
			if (value) identityCache.set(IDENTITY_STORAGE_KEY, value);
		})();
	}
	await initPromise;
}

export async function getEvenIdentity(): Promise<EvenIdentity> {
	await ensureIdentityReady();
	const cached = readCachedIdentity();
	const bridge = await getBridge();

	if (bridge && typeof bridge.getUserInfo === 'function') {
		try {
			console.log('[Identity] requesting user info from bridge');
			const user = await bridge.getUserInfo();
			const nextIdentity: StoredIdentity = {
				evenUid: user?.uid != null ? String(user.uid) : cached.evenUid,
				country: typeof user?.country === 'string' ? user.country : cached.country,
			};
			if (nextIdentity.evenUid || nextIdentity.country) {
				await persistIdentity(nextIdentity);
			}
			return {
				evenUid: nextIdentity.evenUid ?? null,
				country: nextIdentity.country,
			};
		} catch {
			console.warn('[Identity] bridge user info unavailable, falling back to cached identity');
		}
	}

	return {
		evenUid: cached.evenUid ?? null,
		country: cached.country,
	};
}

export function __resetIdentityStoreForTests(): void {
	identityCache.clear();
	bridgePromise = null;
	initPromise = null;
}
