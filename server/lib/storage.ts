import type { TodayResponse } from '../../shared/types';

interface StorageEnv {
	THIS_DAY_KV?: KVNamespace;
}

const inMemoryArtifacts = new Map<string, string>();

export function buildArtifactStorageKey(monthDayKey: string): string {
	return `artifact:${monthDayKey}:v1`;
}

export async function readStoredArtifact(env: StorageEnv, monthDayKey: string): Promise<TodayResponse | null> {
	const key = buildArtifactStorageKey(monthDayKey);
	const local = inMemoryArtifacts.get(key);
	if (local) return JSON.parse(local) as TodayResponse;

	if (!env.THIS_DAY_KV) return null;
	const remote = await env.THIS_DAY_KV.get(key);
	if (!remote) return null;
	inMemoryArtifacts.set(key, remote);
	return JSON.parse(remote) as TodayResponse;
}

export async function writeStoredArtifact(env: StorageEnv, monthDayKey: string, artifact: TodayResponse): Promise<void> {
	const key = buildArtifactStorageKey(monthDayKey);
	const serialized = JSON.stringify(artifact);
	inMemoryArtifacts.set(key, serialized);
	if (env.THIS_DAY_KV) {
		await env.THIS_DAY_KV.put(key, serialized);
	}
}

export async function deleteStoredArtifact(env: StorageEnv, monthDayKey: string): Promise<void> {
	const key = buildArtifactStorageKey(monthDayKey);
	inMemoryArtifacts.delete(key);
	if (env.THIS_DAY_KV) {
		await env.THIS_DAY_KV.delete(key);
	}
}

