import { TextContainerProperty } from '@evenrealities/even_hub_sdk';
import { getTextWidth } from '@evenrealities/pretext';
import type { HudLayoutDescriptor } from './types';

const CONTAINER_CONTENT_LIMIT = 950;
const SPACE_WIDTH = getTextWidth(' ') || 5;

export function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function instantiateLayout(layout: HudLayoutDescriptor, textContents: Record<string, string>) {
	return {
		containerTotalNum: layout.textDescriptors.length + (layout.imageObject?.length ?? 0),
		textObject: layout.textDescriptors.map(
			(descriptor) =>
				new TextContainerProperty({
					...descriptor,
					content: truncate(textContents[descriptor.containerName] ?? ' ', CONTAINER_CONTENT_LIMIT),
				}),
		),
		imageObject: layout.imageObject,
	};
}

function spacesForPx(targetPx: number): string {
	if (targetPx <= 0) return '';
	return ' '.repeat(Math.floor(targetPx / SPACE_WIDTH));
}

export function alignRow(left: string, right: string, innerWidthPx: number): string {
	const available = innerWidthPx - getTextWidth(left) - getTextWidth(right) - 4;
	if (available <= 0) return `${left} ${right}`;
	return `${left}${spacesForPx(available)}${right}`;
}

export function alignThree(left: string, center: string, right: string, innerWidthPx: number): string {
	const leftWidth = getTextWidth(left);
	const centerWidth = getTextWidth(center);
	const rightWidth = getTextWidth(right);
	const centerStart = Math.max(0, Math.floor((innerWidthPx - centerWidth) / 2));
	const leftEnd = leftWidth + 4;
	const rightStart = Math.max(centerStart + centerWidth + 4, innerWidthPx - rightWidth);

	if (leftEnd >= centerStart || centerStart + centerWidth >= rightStart) {
		return alignRow(`${left} ${center}`, right, innerWidthPx);
	}

	const gapAfterLeft = centerStart - leftEnd;
	const gapAfterCenter = rightStart - (centerStart + centerWidth);
	return `${left}${spacesForPx(gapAfterLeft)}${center}${spacesForPx(gapAfterCenter)}${right}`;
}

export function centerLine(text: string, innerWidthPx: number): string {
	const leftPx = Math.max(0, (innerWidthPx - getTextWidth(text) - 4) / 2);
	return `${spacesForPx(leftPx)}${text}`;
}

