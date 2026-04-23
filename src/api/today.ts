import type { TodayResponse } from '../../shared/types';
import { readJsonOrThrow } from './http';
import { getEvenIdentity } from '../services/identity';

export async function loadToday(apiBaseUrl: string): Promise<TodayResponse> {
	console.log('[API:today] resolving identity');
	const identity = await getEvenIdentity();
	const headers = new Headers({
		Accept: 'application/json',
		'X-App-Version': '0.1.0',
	});

	if (identity.evenUid) {
		headers.set('X-Even-User-Uid', identity.evenUid);
	}

	if (identity.country) {
		headers.set('X-Even-User-Country', identity.country);
	}

	console.log('[API:today] request start', {
		apiBaseUrl,
		hasEvenUid: Boolean(identity.evenUid),
	});
	const response = await fetch(`${apiBaseUrl}/api/today?ts=${Date.now()}`, {
		cache: 'no-store',
		headers,
	});
	const payload = await readJsonOrThrow<TodayResponse>(response, 'today');
	console.log('[API:today] request success', {
		key: payload.key,
		isFallback: payload.isFallback,
	});
	return payload;
}

