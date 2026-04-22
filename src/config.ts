declare global {
	interface Window {
		__THIS_DAY_ENV__?: {
			API_BASE_URL?: string;
		};
	}
}

function trimTrailingSlash(value: string): string {
	return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function getApiBaseUrl(): string {
	const runtime = window.__THIS_DAY_ENV__?.API_BASE_URL?.trim();
	if (runtime) return trimTrailingSlash(runtime);

	const host = window.location.hostname;
	if (host === 'localhost' || host === '127.0.0.1') {
		return 'http://127.0.0.1:3001';
	}

	return trimTrailingSlash(window.location.origin);
}

