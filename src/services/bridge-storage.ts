import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

const STREAK_STORAGE_KEY = 'this-day.streak.v1';

interface StreakState {
	lastSeenDateUtc: string;
	count: number;
}

async function getStorageBridge() {
	try {
		return await waitForEvenAppBridge();
	} catch {
		return null;
	}
}

async function readStoredValue(key: string): Promise<string | null> {
	const bridge = await getStorageBridge();
	if (bridge && typeof bridge.getLocalStorage === 'function') {
		return bridge.getLocalStorage(key);
	}
	return window.localStorage.getItem(key);
}

async function writeStoredValue(key: string, value: string): Promise<void> {
	const bridge = await getStorageBridge();
	if (bridge && typeof bridge.setLocalStorage === 'function') {
		await bridge.setLocalStorage(key, value);
		return;
	}
	window.localStorage.setItem(key, value);
}

function diffUtcDays(a: string, b: string): number {
	const aDate = new Date(`${a}T00:00:00.000Z`);
	const bDate = new Date(`${b}T00:00:00.000Z`);
	return Math.round((aDate.getTime() - bDate.getTime()) / 86_400_000);
}

export async function readAndBumpStreak(dateUtc: string): Promise<StreakState> {
	const raw = await readStoredValue(STREAK_STORAGE_KEY);
	const existing = raw ? (JSON.parse(raw) as Partial<StreakState>) : null;
	const lastSeen = existing?.lastSeenDateUtc;

	let next: StreakState;
	if (!lastSeen) {
		next = { lastSeenDateUtc: dateUtc, count: 1 };
	} else if (lastSeen === dateUtc) {
		next = {
			lastSeenDateUtc: dateUtc,
			count: Math.max(1, existing?.count ?? 1),
		};
	} else {
		const delta = diffUtcDays(dateUtc, lastSeen);
		next = {
			lastSeenDateUtc: dateUtc,
			count: delta === 1 ? Math.max(1, existing?.count ?? 1) + 1 : 1,
		};
	}

	await writeStoredValue(STREAK_STORAGE_KEY, JSON.stringify(next));
	return next;
}
