import type { ApiErrorPayload } from '../../shared/types';

function summarize(kind: string, status: number): string {
	return `${kind} returned ${status}`;
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
	if (!value || typeof value !== 'object') return false;
	const payload = value as Record<string, unknown>;
	const error = payload.error;
	return payload.ok === false && !!error && typeof error === 'object' && typeof (error as Record<string, unknown>).code === 'string';
}

export async function readJsonOrThrow<T>(response: Response, kind: string): Promise<T> {
	if (response.ok) {
		return (await response.json()) as T;
	}

	let parsed: unknown = null;
	try {
		parsed = await response.json();
	} catch {
		parsed = null;
	}

	if (isApiErrorPayload(parsed)) {
		console.error(`[API:${kind}] request failed`, {
			status: response.status,
			error: parsed.error,
		});
		throw new Error(`${summarize(kind, response.status)} (${parsed.error.code})`);
	}

	console.error(`[API:${kind}] request failed`, {
		status: response.status,
		body: parsed,
	});
	throw new Error(summarize(kind, response.status));
}
