import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

const PROGRESS_STORAGE_KEY = 'this-day.progress.v2';
const cache = new Map<string, string>();

let bridgePromise: Promise<Awaited<ReturnType<typeof waitForEvenAppBridge>> | null> | null = null;
let initPromise: Promise<void> | null = null;

interface StoredProgressState {
	lastSeenDateUtc?: string;
	visitHistory?: string[];
}

export interface MilestoneState {
	id: string;
	label: string;
	earned: boolean;
}

export interface ProgressSnapshot {
	lastSeenDateUtc: string | null;
	currentDailyStreak: number;
	bestDailyStreak: number;
	weeklyConsistency: number;
	monthlyConsistency: number;
	visitHistory: string[];
	milestones: MilestoneState[];
}

function compareUtcDate(a: string, b: string): number {
	return a.localeCompare(b);
}

function diffUtcDays(a: string, b: string): number {
	const aDate = new Date(`${a}T00:00:00.000Z`);
	const bDate = new Date(`${b}T00:00:00.000Z`);
	return Math.round((aDate.getTime() - bDate.getTime()) / 86_400_000);
}

function addVisitDate(history: string[], dateUtc: string): string[] {
	const next = new Set(history);
	next.add(dateUtc);
	return Array.from(next).sort(compareUtcDate);
}

function countTrailingStreak(history: string[], anchorDateUtc: string): number {
	const visits = new Set(history);
	let streak = 0;
	let cursor = anchorDateUtc;
	while (visits.has(cursor)) {
		streak += 1;
		const previous = new Date(`${cursor}T00:00:00.000Z`);
		previous.setUTCDate(previous.getUTCDate() - 1);
		cursor = previous.toISOString().slice(0, 10);
	}
	return streak;
}

function countBestStreak(history: string[]): number {
	if (history.length === 0) return 0;
	let best = 1;
	let current = 1;
	for (let index = 1; index < history.length; index += 1) {
		const previous = history[index - 1]!;
		const currentDate = history[index]!;
		if (diffUtcDays(currentDate, previous) === 1) {
			current += 1;
			best = Math.max(best, current);
		} else {
			current = 1;
		}
	}
	return best;
}

function countWindowVisits(history: string[], anchorDateUtc: string, days: number): number {
	const anchor = new Date(`${anchorDateUtc}T00:00:00.000Z`);
	const minDate = new Date(anchor);
	minDate.setUTCDate(minDate.getUTCDate() - (days - 1));
	const minKey = minDate.toISOString().slice(0, 10);
	return history.filter((dateUtc) => dateUtc >= minKey && dateUtc <= anchorDateUtc).length;
}

function countMonthVisits(history: string[], anchorDateUtc: string): number {
	const monthPrefix = anchorDateUtc.slice(0, 7);
	return history.filter((dateUtc) => dateUtc.startsWith(monthPrefix)).length;
}

function buildMilestones(snapshot: Omit<ProgressSnapshot, 'milestones'>): MilestoneState[] {
	const weekPerfect = snapshot.weeklyConsistency >= 7;
	return [
		{ id: '3-days', label: '3 days', earned: snapshot.bestDailyStreak >= 3 },
		{ id: '7-days', label: '7 days', earned: snapshot.bestDailyStreak >= 7 },
		{ id: 'perfect-week', label: 'Perfect week', earned: weekPerfect },
		{ id: '10-month', label: '10 this month', earned: snapshot.monthlyConsistency >= 10 },
	];
}

function deriveProgress(history: string[], currentDateUtc: string): ProgressSnapshot {
	const sortedHistory = Array.from(new Set(history)).sort(compareUtcDate);
	const base = {
		lastSeenDateUtc: sortedHistory.at(-1) ?? null,
		currentDailyStreak: countTrailingStreak(sortedHistory, currentDateUtc),
		bestDailyStreak: countBestStreak(sortedHistory),
		weeklyConsistency: countWindowVisits(sortedHistory, currentDateUtc, 7),
		monthlyConsistency: countMonthVisits(sortedHistory, currentDateUtc),
		visitHistory: sortedHistory,
	};

	return {
		...base,
		milestones: buildMilestones(base),
	};
}

async function getBridge() {
	if (!bridgePromise) {
		bridgePromise = Promise.resolve(waitForEvenAppBridge())
			.then((bridge) => bridge ?? null)
			.catch(() => null);
	}
	return bridgePromise;
}

async function initStorageCache(): Promise<void> {
	if (!initPromise) {
		initPromise = (async () => {
			const bridge = await getBridge();
			if (!bridge || typeof bridge.getLocalStorage !== 'function') return;
			const value = await bridge.getLocalStorage(PROGRESS_STORAGE_KEY);
			if (value) cache.set(PROGRESS_STORAGE_KEY, value);
		})();
	}
	return initPromise;
}

function getCachedProgressState(): StoredProgressState {
	const raw = cache.get(PROGRESS_STORAGE_KEY);
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw) as StoredProgressState;
		return {
			lastSeenDateUtc: parsed.lastSeenDateUtc || undefined,
			visitHistory: Array.isArray(parsed.visitHistory) ? parsed.visitHistory.filter(Boolean) : [],
		};
	} catch {
		return {};
	}
}

async function persistProgressState(next: StoredProgressState): Promise<void> {
	const serialized = JSON.stringify(next);
	cache.set(PROGRESS_STORAGE_KEY, serialized);

	const bridge = await getBridge();
	if (bridge && typeof bridge.setLocalStorage === 'function') {
		void bridge.setLocalStorage(PROGRESS_STORAGE_KEY, serialized).catch(() => {});
	}
}

export async function ensureBridgeStorageReady(): Promise<void> {
	await initStorageCache();
}

export async function readAndTrackProgress(dateUtc: string): Promise<ProgressSnapshot> {
	await initStorageCache();
	const existing = getCachedProgressState();
	const nextHistory = addVisitDate(existing.visitHistory ?? [], dateUtc);
	const nextState: StoredProgressState = {
		lastSeenDateUtc: dateUtc,
		visitHistory: nextHistory,
	};
	await persistProgressState(nextState);
	return deriveProgress(nextHistory, dateUtc);
}

export function __resetProgressStoreForTests(): void {
	cache.clear();
	bridgePromise = null;
	initPromise = null;
}
