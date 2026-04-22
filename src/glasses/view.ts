import type { TodayResponse } from '../../shared/types';
import { formatUtcLongDate, toUtcDateString } from '../../shared/utc';
import { formatClock } from '../lib/time';
import type { HudLayoutDescriptor, HudPage, HudRenderState, HudViewState } from './types';
import { alignRow, alignThree, centerLine } from './utils';

const HUD_WIDTH = 576;
const HUD_HEIGHT = 288;
const BODY_WIDTH = 544;
const BORDER_RADIUS = 12;

const TEXT_LAYOUT: HudLayoutDescriptor = {
	key: 'text',
	textDescriptors: [
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
			isEventCapture: 1,
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

const SECTION_DISPLAY_TITLES: Record<HudPage['sectionId'], string> = {
	moment: 'The Moment',
	'why-it-matters': 'Why it Matters',
	context: 'Context',
	aftermath: 'Aftermath',
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
			});
			globalIndex += 1;
		});
	}
	return pages;
}

function buildFooter(page: HudPage): string {
	return alignRow(
		`${SECTION_DISPLAY_TITLES[page.sectionId]} • ${page.sectionPageIndex + 1}/${page.sectionPageTotal}`,
		`${page.globalIndex + 1}/${page.globalTotal}`,
		BODY_WIDTH,
	);
}

function buildBody(page: HudPage, payload: TodayResponse | null): string {
	if (!payload) return page.body;

	if (page.sectionPageIndex > 0) {
		return `\n${page.body}`;
	}

	if (page.sectionId === 'moment') {
		return `\n${centerLine(`•    The Moment - ${payload.fact.year}    •`, BODY_WIDTH)}\n\n${page.body}`;
	}

	return `\n${centerLine(`•    ${page.sectionTitle}    •`, BODY_WIDTH)}\n\n${page.body}`;
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
	const dateLabel = formatUtcLongDate(state.payload?.dateUtc ?? toUtcDateString(state.now));
	const header = alignThree(formatClock(state.now), dateLabel, 'This Day', BODY_WIDTH);

	if (state.status === 'loading') {
		return {
			layout: TEXT_LAYOUT,
			textContents: {
				header,
				body: `\n${centerLine('Preparing the daily artifact', BODY_WIDTH)}\n\nFetching the UTC moment and formatting the section deck for the HUD.`,
				footer: 'Moment 0/0',
			},
		};
	}

	if (state.status === 'error' || !state.payload || state.pages.length === 0) {
		return {
			layout: TEXT_LAYOUT,
			textContents: {
				header,
				body: `\n${centerLine('History missed its cue', BODY_WIDTH)}\n\n${state.errorMessage || 'The HUD could not load the daily artifact.'}`,
				footer: 'Tap to retry tomorrow',
			},
		};
	}

	const page = state.pages[state.pageIndex]!;
	return {
		layout: TEXT_LAYOUT,
		textContents: {
			header,
			body: buildBody(page, state.payload),
			footer: buildFooter(page),
		},
	};
}
