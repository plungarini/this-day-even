import { ImageContainerProperty } from '@evenrealities/even_hub_sdk';
import type { TodayResponse } from '../../shared/types';
import { formatClock } from '../lib/time';
import type { HudLayoutDescriptor, HudPage, HudRenderState, HudViewState } from './types';
import { HERO_IMAGE_HEIGHT, HERO_IMAGE_ID, HERO_IMAGE_NAME, HERO_IMAGE_WIDTH } from './image-controller';
import { alignRow, centerLine } from './utils';

const HUD_WIDTH = 576;
const HUD_HEIGHT = 288;
const BODY_WIDTH = 544;
const BORDER_RADIUS = 12;

const TEXT_LAYOUT: HudLayoutDescriptor = {
	key: 'text',
	textDescriptors: [
		{
			containerID: 0,
			containerName: 'shield',
			xPosition: 0,
			yPosition: 0,
			width: HUD_WIDTH,
			height: HUD_HEIGHT,
			borderWidth: 0,
			paddingLength: 0,
			isEventCapture: 1,
		},
		{
			containerID: 1,
			containerName: 'header',
			xPosition: 12,
			yPosition: 0,
			width: HUD_WIDTH - 24,
			height: 40,
			paddingLength: 4,
		},
		{
			containerID: 2,
			containerName: 'body',
			xPosition: 0,
			yPosition: 38,
			width: HUD_WIDTH,
			height: 212,
			paddingLength: 15,
			borderWidth: 1,
			borderColor: 13,
			borderRadius: BORDER_RADIUS,
		},
		{
			containerID: 3,
			containerName: 'footer',
			xPosition: 12,
			yPosition: 251,
			width: HUD_WIDTH - 24,
			height: 35,
			paddingLength: 4,
		},
	],
};

const IMAGE_LAYOUT: HudLayoutDescriptor = {
	key: 'artifact-image',
	textDescriptors: [
		{
			containerID: 0,
			containerName: 'shield',
			xPosition: 0,
			yPosition: 0,
			width: HUD_WIDTH,
			height: HUD_HEIGHT,
			borderWidth: 0,
			paddingLength: 0,
			isEventCapture: 1,
		},
		{
			containerID: 1,
			containerName: 'header',
			xPosition: 12,
			yPosition: 0,
			width: HUD_WIDTH - 24,
			height: 40,
			paddingLength: 4,
		},
		{
			containerID: 2,
			containerName: 'body',
			xPosition: 0,
			yPosition: 201,
			width: HUD_WIDTH,
			height: 49,
			paddingLength: 15,
			borderWidth: 1,
			borderColor: 13,
			borderRadius: BORDER_RADIUS,
		},
		{
			containerID: 3,
			containerName: 'footer',
			xPosition: 12,
			yPosition: 251,
			width: HUD_WIDTH - 24,
			height: 35,
			paddingLength: 4,
		},
	],
	imageObject: [
		new ImageContainerProperty({
			containerID: HERO_IMAGE_ID,
			containerName: HERO_IMAGE_NAME,
			xPosition: (HUD_WIDTH - HERO_IMAGE_WIDTH) / 2,
			yPosition: 52,
			width: HERO_IMAGE_WIDTH,
			height: HERO_IMAGE_HEIGHT,
		}),
	],
};

const SECTION_LABELS: Record<HudPage['sectionId'], string> = {
	moment: 'Moment',
	'why-it-matters': 'Why',
	context: 'Context',
	aftermath: 'After',
	artifact: 'Artifact',
};

function flattenPages(payload: TodayResponse): HudPage[] {
	const pages: HudPage[] = [];
	const globalTotal = payload.fact.sections.reduce((sum, section) => sum + section.hudPages.length, 0);
	let globalIndex = 0;
	for (const section of payload.fact.sections) {
		section.hudPages.forEach((body, sectionPageIndex) => {
			pages.push({
				sectionId: section.id,
				sectionTitle: section.title,
				body,
				sectionPageIndex,
				sectionPageTotal: section.hudPages.length,
				globalIndex,
				globalTotal,
				usesHeroImage: section.id === 'artifact' && sectionPageIndex === 0 && Boolean(payload.fact.heroImage),
			});
			globalIndex += 1;
		});
	}
	return pages;
}

function buildFooter(page: HudPage): string {
	return alignRow(
		`${SECTION_LABELS[page.sectionId]} ${page.sectionPageIndex + 1}/${page.sectionPageTotal}`,
		`${page.globalIndex + 1}/${page.globalTotal}`,
		BODY_WIDTH,
	);
}

function buildBody(page: HudPage, payload: TodayResponse | null): string {
	if (!payload) return page.body;
	const firstLine = page.sectionId === 'moment' ? `${payload.fact.year}` : SECTION_LABELS[page.sectionId];
	return `${centerLine(firstLine, BODY_WIDTH)}\n\n${centerLine(page.sectionTitle, BODY_WIDTH)}\n\n${page.body}`.trim();
}

export function createLoadingHudState(): HudViewState {
	return {
		status: 'loading',
		now: new Date(),
		payload: null,
		pages: [],
		pageIndex: 0,
	};
}

export function createErrorHudState(message: string): HudViewState {
	return {
		status: 'error',
		now: new Date(),
		payload: null,
		pages: [],
		pageIndex: 0,
		errorMessage: message,
	};
}

export function createReadyHudState(payload: TodayResponse): HudViewState {
	return {
		status: 'ready',
		now: new Date(),
		payload,
		pages: flattenPages(payload),
		pageIndex: 0,
	};
}

export function stepHudState(state: HudViewState, offset: number): HudViewState {
	if (state.pages.length === 0) return { ...state, now: new Date() };
	return {
		...state,
		now: new Date(),
		pageIndex: Math.min(Math.max(state.pageIndex + offset, 0), state.pages.length - 1),
	};
}

export function resetHudState(state: HudViewState): HudViewState {
	return {
		...state,
		now: new Date(),
		pageIndex: 0,
	};
}

export function touchHudClock(state: HudViewState): HudViewState {
	return {
		...state,
		now: new Date(),
	};
}

export function toHudRenderState(state: HudViewState): HudRenderState {
	const header = alignRow(formatClock(state.now), 'This Day', BODY_WIDTH);

	if (state.status === 'loading') {
		return {
			layout: TEXT_LAYOUT,
			textContents: {
				shield: ' ',
				header,
				body: `${centerLine('Preparing the daily artifact', BODY_WIDTH)}\n\nFetching the UTC moment and formatting the section deck for the HUD.`,
				footer: 'Moment 0/0',
			},
		};
	}

	if (state.status === 'error' || !state.payload || state.pages.length === 0) {
		return {
			layout: TEXT_LAYOUT,
			textContents: {
				shield: ' ',
				header,
				body: `${centerLine('History missed its cue', BODY_WIDTH)}\n\n${state.errorMessage || 'The HUD could not load the daily artifact.'}`,
				footer: 'Tap to retry tomorrow',
			},
		};
	}

	const page = state.pages[state.pageIndex]!;
	return {
		layout: page.usesHeroImage ? IMAGE_LAYOUT : TEXT_LAYOUT,
		textContents: {
			shield: ' ',
			header,
			body: buildBody(page, state.payload),
			footer: buildFooter(page),
		},
		imageUrl: page.usesHeroImage ? state.payload.fact.heroImage?.url : undefined,
		imageAlt: page.usesHeroImage ? state.payload.fact.heroImage?.alt : undefined,
	};
}

