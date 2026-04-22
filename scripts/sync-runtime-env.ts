import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');
const wranglerPath = path.join(appRoot, 'wrangler.toml');
const devVarsPath = path.join(appRoot, '.dev.vars');
const runtimeEnvPath = path.join(appRoot, 'public', 'env.js');
const runtimeEnvExamplePath = path.join(appRoot, 'public', 'env.example.js');

function readFileIfExists(filePath: string): string {
	return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

function readTomlString(content: string, sectionName: string, key: string): string | null {
	const escapedSection = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const sectionPattern = new RegExp(`\\[${escapedSection}\\]([\\s\\S]*?)(?=\\n\\[|$)`);
	const sectionMatch = content.match(sectionPattern);
	const sectionBody = sectionMatch?.[1] ?? '';
	const keyPattern = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm');
	return sectionBody.match(keyPattern)?.[1] ?? null;
}

function readDevVar(content: string, key: string): string | null {
	const pattern = new RegExp(`^${key}\\s*=\\s*"?([^"\\r\\n]+)"?$`, 'm');
	return content.match(pattern)?.[1] ?? null;
}

function buildRuntimeEnvFile(apiBaseUrl: string): string {
	return `// Generated from Wrangler/app environment. Do not edit by hand.\nwindow.__THIS_DAY_ENV__ = {\n  API_BASE_URL: '${apiBaseUrl}'\n};\n`;
}

const mode = process.argv[2] === 'dev' ? 'dev' : 'prod';
const wranglerToml = readFileIfExists(wranglerPath);
const devVars = readFileIfExists(devVarsPath);

const productionApiBaseUrl =
	process.env.APP_BASE_URL?.trim() ||
	readTomlString(wranglerToml, 'vars', 'APP_BASE_URL') ||
	'https://this-day-even.plungarini.workers.dev';

const developmentApiBaseUrl =
	readDevVar(devVars, 'APP_BASE_URL') ||
	readTomlString(wranglerToml, 'env.dev.vars', 'APP_BASE_URL') ||
	'http://127.0.0.1:3001';

const selectedApiBaseUrl = mode === 'dev' ? developmentApiBaseUrl : productionApiBaseUrl;

writeFileSync(runtimeEnvPath, buildRuntimeEnvFile(selectedApiBaseUrl));
writeFileSync(runtimeEnvExamplePath, buildRuntimeEnvFile(productionApiBaseUrl));

console.log(`[this-day] synced runtime env for ${mode}: ${selectedApiBaseUrl}`);
