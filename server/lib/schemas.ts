import { z } from 'zod';

const sectionIdSchema = z.enum(['moment', 'why-it-matters', 'context', 'aftermath', 'artifact']);

export const scorerResultSchema = z.object({
	winnerIndex: z.number().int().nonnegative(),
	backups: z.array(z.number().int().nonnegative()).max(2).default([]),
	scoredCandidates: z
		.array(
			z.object({
				index: z.number().int().nonnegative(),
				retention: z.number().min(0).max(100),
				obscurity: z.number().min(0).max(100),
				weirdness: z.number().min(0).max(100),
				compressibility: z.number().min(0).max(100),
				confidence: z.number().min(0).max(100),
				note: z.string().min(1).max(280),
			}),
		)
		.min(1),
});

export const writerDraftSchema = z.object({
	slug: z.string().min(1),
	title: z.string().min(1).max(140),
	deck: z.string().min(1).max(220),
	summary: z.string().min(1).max(320),
	taxonomy: z.object({
		categories: z.array(z.string().min(1).max(40)).min(1).max(5),
	}),
	scoring: z.object({
		retention: z.number().min(0).max(100),
		obscurity: z.number().min(0).max(100),
		weirdness: z.number().min(0).max(100),
		compressibility: z.number().min(0).max(100),
		confidence: z.number().min(0).max(100),
	}),
	sections: z
		.array(
			z.object({
				id: sectionIdSchema,
				title: z.string().min(1).max(60),
				webBody: z.string().min(1).max(700),
				sourceIds: z.array(z.string().min(1)).max(4).default([]),
			}),
		)
		.length(5),
});

export type ScorerResult = z.infer<typeof scorerResultSchema>;
export type WriterDraft = z.infer<typeof writerDraftSchema>;

export const scorerJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['winnerIndex', 'backups', 'scoredCandidates'],
	properties: {
		winnerIndex: { type: 'integer', minimum: 0 },
		backups: {
			type: 'array',
			maxItems: 2,
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
					index: { type: 'integer', minimum: 0 },
					retention: { type: 'number', minimum: 0, maximum: 100 },
					obscurity: { type: 'number', minimum: 0, maximum: 100 },
					weirdness: { type: 'number', minimum: 0, maximum: 100 },
					compressibility: { type: 'number', minimum: 0, maximum: 100 },
					confidence: { type: 'number', minimum: 0, maximum: 100 },
					note: { type: 'string', minLength: 1, maxLength: 280 },
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
		slug: { type: 'string', minLength: 1 },
		title: { type: 'string', minLength: 1, maxLength: 140 },
		deck: { type: 'string', minLength: 1, maxLength: 220 },
		summary: { type: 'string', minLength: 1, maxLength: 320 },
		taxonomy: {
			type: 'object',
			additionalProperties: false,
			required: ['categories'],
			properties: {
				categories: {
					type: 'array',
					minItems: 1,
					maxItems: 5,
					items: { type: 'string', minLength: 1, maxLength: 40 },
				},
			},
		},
		scoring: {
			type: 'object',
			additionalProperties: false,
			required: ['retention', 'obscurity', 'weirdness', 'compressibility', 'confidence'],
			properties: {
				retention: { type: 'number', minimum: 0, maximum: 100 },
				obscurity: { type: 'number', minimum: 0, maximum: 100 },
				weirdness: { type: 'number', minimum: 0, maximum: 100 },
				compressibility: { type: 'number', minimum: 0, maximum: 100 },
				confidence: { type: 'number', minimum: 0, maximum: 100 },
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
					},
					title: { type: 'string', minLength: 1, maxLength: 60 },
					webBody: { type: 'string', minLength: 1, maxLength: 700 },
					sourceIds: {
						type: 'array',
						maxItems: 4,
						items: { type: 'string', minLength: 1 },
					},
				},
			},
		},
	},
} as const;

