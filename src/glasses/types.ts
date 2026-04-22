import type { ImageContainerProperty } from '@evenrealities/even_hub_sdk';
import type { SectionId, TodayResponse } from '../../shared/types';

export interface HudTextDescriptor {
	containerID: number;
	containerName: string;
	xPosition: number;
	yPosition: number;
	width: number;
	height: number;
	paddingLength?: number;
	borderWidth?: number;
	borderRadius?: number;
	borderColor?: number;
	isEventCapture?: number;
}

export interface HudLayoutDescriptor {
	key: string;
	textDescriptors: HudTextDescriptor[];
	imageObject?: ImageContainerProperty[];
}

export interface HudRenderState {
	layout: HudLayoutDescriptor;
	textContents: Record<string, string>;
}

export interface HudPage {
	sectionId: SectionId;
	sectionTitle: string;
	body: string;
	sectionPageIndex: number;
	sectionPageTotal: number;
	globalIndex: number;
	globalTotal: number;
}

export interface HudViewState {
	status: 'loading' | 'ready' | 'error';
	now: Date;
	payload: TodayResponse | null;
	pages: HudPage[];
	pageIndex: number;
	errorMessage?: string;
}

