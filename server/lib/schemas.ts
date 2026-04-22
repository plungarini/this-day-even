import { z } from 'zod';

const sectionIdSchema = z.enum(['moment', 'why-it-matters', 'context', 'aftermath', 'artifact']);
const canonicalSectionOrder = ['moment', 'why-it-matters', 'context', 'aftermath', 'artifact'] as const;
const canonicalSectionTitles: Record<(typeof canonicalSectionOrder)[number], string> = {
	moment: 'The Moment',
	'why-it-matters': 'Why it matters',
	context: 'Context',
	aftermath: 'Aftermath',
	artifact: 'Artifact',
};

const bannedMetaPatterns = [
	/\boptimized for\b/i,
	/\bdaily ritual\b/i,
	/\bpage\s+\d+\b/i,
	/\bwikipedia summary\b/i,
	/\barchive:\b/i,
	/\bread later:\b/i,
	/\bimage\s+\d+\s+of\b/i,
	/\bcommentator of the community council\b/i,
	/https?:\/\/\S+/i,
	/\[[^\]]+\]\([^)]+\)/,
	/\b\w+_\w+\b/,
	/(?:^|\s)[A-Z][A-Z\s,:-]{18,}(?:\s|$)/,
];

function cleanWhitespace(text: string): string {
	return text
		.replace(/\r\n/g, '\n')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function startsWithRepeatedHeading(text: string): boolean {
	const [firstLine = '', secondLine = ''] = cleanWhitespace(text)
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	if (!firstLine || !secondLine) return false;
	if (firstLine.length > 48) return false;
	return /^[A-Z][A-Za-z'’ -]+:?$/.test(firstLine) && secondLine.length > 0;
}

function hasColonHeavyLabel(text: string): boolean {
	return /(?:^|\n)(?:[A-Z][A-Za-z]+:){2,}/.test(text) || /(?:^|\s)(?:Archive|Source|Wikipedia summary|Read later):/i.test(text);
}

function hasOcrNoise(text: string): boolean {
	const tokens = text.split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return false;
	const weirdTokens = tokens.filter((token) => {
		const plain = token.replace(/[^A-Za-z0-9]/g, '');
		if (plain.length < 4) return false;
		const hasDigit = /\d/.test(plain);
		const hasLower = /[a-z]/.test(plain);
		const hasUpper = /[A-Z]/.test(plain);
		const vowelCount = (plain.match(/[aeiou]/gi) || []).length;
		return hasDigit || (hasLower && hasUpper && vowelCount <= 1) || (!hasLower && hasUpper && plain.length >= 8);
	});
	return weirdTokens.length >= 3 || weirdTokens.length / tokens.length > 0.2;
}

export function isCleanGeneratedProse(text: string): boolean {
	const normalized = cleanWhitespace(text);
	if (!normalized) return false;
	if (bannedMetaPatterns.some((pattern) => pattern.test(normalized))) return false;
	if (/^[\s`~*_:/\\|[\]-]+|[\s`~*_:/\\|[\]-]+$/.test(normalized)) return false;
	if (startsWithRepeatedHeading(normalized)) return false;
	if (hasColonHeavyLabel(normalized)) return false;
	if (hasOcrNoise(normalized)) return false;
	return true;
}

export function sanitizeGeneratedProse(text: string): string {
	return cleanWhitespace(
		text
			.replace(/^\s*(?:Page\s+\d+\s+)+/i, '')
			.replace(/^\s*(?:Read later|Archive|Wikipedia summary):\s*/i, '')
			.replace(/\[[^\]]+\]\(([^)]+)\)/g, '$1')
			.replace(/https?:\/\/\S+/gi, '')
			.replace(/\s+[|•-]\s*$/g, '')
			.replace(/\s{2,}/g, ' '),
	);
}

export const scorerResultSchema = z.object({
	winnerIndex: z.number().int().nonnegative().describe('Index of the single best candidate event.'),
	backups: z.array(z.number().int().nonnegative()).max(2).default([]).describe('Up to two backup candidate indexes.'),
	scoredCandidates: z
		.array(
			z.object({
				index: z.number().int().nonnegative().describe('Candidate index being scored.'),
				retention: z.number().min(0).max(100).describe('Estimated repeat-open and tell-a-friend potential.'),
				obscurity: z.number().min(0).max(100).describe('How non-obvious or lesser-known the event feels.'),
				weirdness: z.number().min(0).max(100).describe('How surprising or unexpected the event feels.'),
				compressibility: z.number().min(0).max(100).describe('How well the story compresses into short section copy.'),
				confidence: z.number().min(0).max(100).describe('Confidence that the candidate is well-supported by the provided evidence.'),
				note: z.string().min(1).max(280).describe('Short rationale for the score.'),
			}),
		)
		.min(1),
});

export const writerDraftSchema = z.object({
	slug: z.string().min(1).describe('URL-safe slug for this artifact.'),
	title: z.string().min(1).max(140).describe('Final display title in presentation-ready title case.'),
	deck: z.string().min(1).max(220).describe('A brief factual subtitle, not product commentary or meta framing.'),
	summary: z.string().min(1).max(320).describe('One clean factual paragraph introducing the event without setup language or provenance labels.'),
	taxonomy: z.object({
		categories: z.array(z.string().min(1).max(40)).min(1).max(5).describe('Up to five short factual category labels.'),
	}),
	scoring: z.object({
		retention: z.number().min(0).max(100).describe('Predicted retention score.'),
		obscurity: z.number().min(0).max(100).describe('Predicted obscurity score.'),
		weirdness: z.number().min(0).max(100).describe('Predicted weirdness score.'),
		compressibility: z.number().min(0).max(100).describe('Predicted compressibility score.'),
		confidence: z.number().min(0).max(100).describe('Predicted confidence score.'),
	}),
	sections: z
		.array(
			z.object({
				id: sectionIdSchema.describe('One of the five fixed section ids in canonical order.'),
				title: z.string().min(1).max(60).describe('Exact section display title.'),
				webBody: z.string().min(1).max(700).describe('Final user-facing prose only. No headers, links, labels, OCR fragments, or formatting scaffolding.'),
				sourceIds: z.array(z.string().min(1)).max(4).default([]).describe('IDs of sources that support the section body.'),
			}),
		)
		.length(5),
}).superRefine((draft, ctx) => {
	draft.sections.forEach((section, index) => {
		const expectedId = canonicalSectionOrder[index];
		if (section.id !== expectedId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['sections', index, 'id'],
				message: `Section ${index} must be ${expectedId}.`,
			});
		}
		if (section.title !== canonicalSectionTitles[section.id]) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['sections', index, 'title'],
				message: `Section title for ${section.id} must be "${canonicalSectionTitles[section.id]}".`,
			});
		}
	});
});

export type ScorerResult = z.infer<typeof scorerResultSchema>;
export type WriterDraft = z.infer<typeof writerDraftSchema>;

export const scorerJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['winnerIndex', 'backups', 'scoredCandidates'],
	properties: {
		winnerIndex: { type: 'integer', minimum: 0, description: 'Index of the single best candidate event.' },
		backups: {
			type: 'array',
			maxItems: 2,
			description: 'Up to two backup candidate indexes.',
			items: { type: 'integer', minimum: 0 },
		},
		scoredCandidates: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['index', 'retention', 'obscurity', 'weirdness', 'compressibility', 'confidence', 'note'],
				properties: {
					index: { type: 'integer', minimum: 0, description: 'Candidate index being scored.' },
					retention: { type: 'number', minimum: 0, maximum: 100, description: 'Estimated repeat-open and tell-a-friend potential.' },
					obscurity: { type: 'number', minimum: 0, maximum: 100, description: 'How non-obvious or lesser-known the event feels.' },
					weirdness: { type: 'number', minimum: 0, maximum: 100, description: 'How surprising or unexpected the event feels.' },
					compressibility: { type: 'number', minimum: 0, maximum: 100, description: 'How well the story compresses into short section copy.' },
					confidence: { type: 'number', minimum: 0, maximum: 100, description: 'Confidence that the event is well-supported.' },
					note: { type: 'string', minLength: 1, maxLength: 280, description: 'Short rationale for the score.' },
				},
			},
		},
	},
} as const;

export const writerJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['slug', 'title', 'deck', 'summary', 'taxonomy', 'scoring', 'sections'],
	properties: {
		slug: { type: 'string', minLength: 1, description: 'URL-safe slug for the artifact.' },
		title: { type: 'string', minLength: 1, maxLength: 140, description: 'Final display title in presentation-ready title case.' },
		deck: { type: 'string', minLength: 1, maxLength: 220, description: 'Brief factual subtitle only, never product commentary or meta framing.' },
		summary: { type: 'string', minLength: 1, maxLength: 320, description: 'One clean factual paragraph introducing the event.' },
		taxonomy: {
			type: 'object',
			additionalProperties: false,
			required: ['categories'],
			properties: {
				categories: {
					type: 'array',
					minItems: 1,
					maxItems: 5,
					items: { type: 'string', minLength: 1, maxLength: 40, description: 'Short factual category label.' },
				},
			},
		},
		scoring: {
			type: 'object',
			additionalProperties: false,
			required: ['retention', 'obscurity', 'weirdness', 'compressibility', 'confidence'],
			properties: {
				retention: { type: 'number', minimum: 0, maximum: 100, description: 'Predicted retention score.' },
				obscurity: { type: 'number', minimum: 0, maximum: 100, description: 'Predicted obscurity score.' },
				weirdness: { type: 'number', minimum: 0, maximum: 100, description: 'Predicted weirdness score.' },
				compressibility: { type: 'number', minimum: 0, maximum: 100, description: 'Predicted compressibility score.' },
				confidence: { type: 'number', minimum: 0, maximum: 100, description: 'Predicted confidence score.' },
			},
		},
		sections: {
			type: 'array',
			minItems: 5,
			maxItems: 5,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['id', 'title', 'webBody', 'sourceIds'],
				properties: {
					id: {
						type: 'string',
						enum: ['moment', 'why-it-matters', 'context', 'aftermath', 'artifact'],
						description: 'Fixed section id in canonical order.',
					},
					title: { type: 'string', minLength: 1, maxLength: 60, description: 'Exact section display title.' },
					webBody: { type: 'string', minLength: 1, maxLength: 700, description: 'Final user-facing prose only. No headers, links, or provenance formatting.' },
					sourceIds: {
						type: 'array',
						maxItems: 4,
						description: 'IDs of sources that support the section body.',
						items: { type: 'string', minLength: 1 },
					},
				},
			},
		},
	},
} as const;

