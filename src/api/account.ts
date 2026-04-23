import type { MeResponse } from '../../shared/types';
import { readJsonOrThrow } from './http';
import { getEvenIdentity } from '../services/identity';

export async function loadMe(apiBaseUrl: string): Promise<MeResponse> {
	console.log('[API:me] resolving identity');
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

	console.log('[API:me] request start', {
		apiBaseUrl,
		hasEvenUid: Boolean(identity.evenUid),
	});
	const response = await fetch(`${apiBaseUrl}/api/me?ts=${Date.now()}`, {
		cache: 'no-store',
		headers,
	});
	const payload = await readJsonOrThrow<MeResponse>(response, 'me');
	console.log('[API:me] request success', {
		phase: payload.access.phase,
		state: payload.access.state,
	});
	return payload;
}
