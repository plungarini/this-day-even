const baseUrl = process.env.APP_BASE_URL || 'http://127.0.0.1:3001';
const endpoint = new URL('/api/dev/reset-today', baseUrl);

async function main() {
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
		},
	});

	if (!response.ok) {
		throw new Error(`Reset failed: ${response.status} ${await response.text()}`);
	}

	const payload = (await response.json()) as {
		ok: boolean;
		key: string;
		title: string;
		generatedAt: string;
	};

	process.stdout.write(`regenerated ${payload.key}: ${payload.title}\n`);
	process.stdout.write(`generated at ${payload.generatedAt}\n`);
}

void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
