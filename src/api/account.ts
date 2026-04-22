import type { MeResponse } from '../../shared/types';
import { getEvenIdentity } from '../services/identity';

export async function loadMe(apiBaseUrl: string): Promise<MeResponse> {
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

	const response = await fetch(`${apiBaseUrl}/api/me?ts=${Date.now()}`, {
		cache: 'no-store',
		headers,
	});
	if (!response.ok) throw new Error(`This Day account API returned ${response.status}`);
	return (await response.json()) as MeResponse;
}
