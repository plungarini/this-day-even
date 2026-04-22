import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromMonthDayKey } from '../shared/utc';
import { generateArtifact, type WorkerBindings } from '../server/lib/generate';
import { buildArtifactStorageKey } from '../server/lib/storage';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');

function allMonthDayKeys(): string[] {
	const year = 2024;
	const keys: string[] = [];
	let cursor = new Date(`${year}-01-01T00:00:00.000Z`);
	while (cursor.getUTCFullYear() === year) {
		const month = String(cursor.getUTCMonth() + 1).padStart(2, '0');
		const day = String(cursor.getUTCDate()).padStart(2, '0');
		keys.push(`${month}-${day}`);
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return keys;
}

async function uploadToCloudflare(key: string, value: string) {
	const accountId = process.env.CF_ACCOUNT_ID;
	const namespaceId = process.env.CF_KV_NAMESPACE_ID;
	const apiToken = process.env.CF_API_TOKEN;
	if (!accountId || !namespaceId || !apiToken) return false;

	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`,
		{
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'text/plain',
			},
			body: value,
		},
	);

	if (!response.ok) {
		throw new Error(`Cloudflare KV upload failed for ${key}: ${response.status} ${await response.text()}`);
	}
	return true;
}

async function writePreviewFile(key: string, value: string) {
	const outputDir = path.join(appDir, '.wrangler', 'backfill-preview');
	await fs.mkdir(outputDir, { recursive: true });
	await fs.writeFile(path.join(outputDir, `${key}.json`), value, 'utf8');
}

async function main() {
	const env: WorkerBindings = {
		OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
		OPENROUTER_SCORER_MODEL: process.env.OPENROUTER_SCORER_MODEL,
		OPENROUTER_WRITER_MODEL: process.env.OPENROUTER_WRITER_MODEL,
		OPENROUTER_SCORER_THINKING: process.env.OPENROUTER_SCORER_THINKING,
		OPENROUTER_WRITER_THINKING: process.env.OPENROUTER_WRITER_THINKING,
		APP_BASE_URL: process.env.APP_BASE_URL,
		APP_NAME: process.env.APP_NAME,
	};

	const keys = allMonthDayKeys();
	let uploadedAny = false;

	for (const key of keys) {
		const artifact = await generateArtifact(env, fromMonthDayKey(key, 2024));
		const storageKey = buildArtifactStorageKey(key);
		const serialized = JSON.stringify(artifact, null, 2);
		const uploaded = await uploadToCloudflare(storageKey, serialized);
		if (!uploaded) {
			await writePreviewFile(storageKey, serialized);
		} else {
			uploadedAny = true;
		}
		process.stdout.write(`backfilled ${storageKey}\n`);
	}

	if (!uploadedAny) {
		process.stdout.write('No Cloudflare KV credentials found; wrote preview files under .wrangler/backfill-preview instead.\n');
	}
}

void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

