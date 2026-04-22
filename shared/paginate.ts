export function paginateHudText(text: string, maxChars = 360): string[] {
	const normalized = text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
	if (!normalized) return [''];

	const paragraphs = normalized.split(/\n{2,}/).map((entry) => entry.trim()).filter(Boolean);
	const pages: string[] = [];
	let current = '';

	for (const paragraph of paragraphs) {
		const combined = current ? `${current}\n\n${paragraph}` : paragraph;
		if (combined.length <= maxChars) {
			current = combined;
			continue;
		}

		if (current) {
			pages.push(current);
			current = '';
		}

		if (paragraph.length <= maxChars) {
			current = paragraph;
			continue;
		}

		const words = paragraph.split(/\s+/);
		let chunk = '';
		for (const word of words) {
			const next = chunk ? `${chunk} ${word}` : word;
			if (next.length > maxChars && chunk) {
				pages.push(chunk);
				chunk = word;
			} else {
				chunk = next;
			}
		}
		if (chunk) current = chunk;
	}

	if (current) pages.push(current);
	return pages.length > 0 ? pages : [''];
}

