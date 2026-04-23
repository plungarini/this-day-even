declare global {
	interface Window {
		__THIS_DAY_ENV__?: {
			API_BASE_URL?: string;
		};
	}
}

const LOCAL_API_BASE_URL = 'http://127.0.0.1:3001';
const PRODUCTION_API_BASE_URL = 'https://this-day-even.plungarini.workers.dev';

function trimTrailingSlash(value: string): string {
	return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function getApiBaseUrl(): string {
	if (import.meta.env.DEV) {
		return LOCAL_API_BASE_URL;
	}

	const runtime = window.__THIS_DAY_ENV__?.API_BASE_URL?.trim();
	if (runtime) return trimTrailingSlash(runtime);

	return PRODUCTION_API_BASE_URL;
}
