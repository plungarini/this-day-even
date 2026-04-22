import type { TodayResponse } from '../../shared/types';

export async function loadToday(apiBaseUrl: string): Promise<TodayResponse> {
	const response = await fetch(`${apiBaseUrl}/api/today`, {
		headers: {
			Accept: 'application/json',
		},
	});
	if (!response.ok) throw new Error(`This Day API returned ${response.status}`);
	return (await response.json()) as TodayResponse;
}

