import {
	ImageRawDataUpdate,
	ImageRawDataUpdateResult,
	type EvenAppBridge,
} from '@evenrealities/even_hub_sdk';

export const HERO_IMAGE_ID = 4;
export const HERO_IMAGE_NAME = 'hero-image';
export const HERO_IMAGE_WIDTH = 288;
export const HERO_IMAGE_HEIGHT = 144;

function dataUrlToBytes(dataUrl: string): number[] {
	const base64 = dataUrl.split(',')[1] ?? '';
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return Array.from(bytes);
}

async function loadImage(url: string): Promise<HTMLImageElement> {
	return await new Promise((resolve, reject) => {
		const image = new Image();
		image.crossOrigin = 'anonymous';
		image.referrerPolicy = 'no-referrer';
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`Could not load ${url}`));
		image.src = url;
	});
}

async function renderImageBytes(url: string): Promise<number[] | null> {
	try {
		const image = await loadImage(url);
		const canvas = document.createElement('canvas');
		canvas.width = HERO_IMAGE_WIDTH;
		canvas.height = HERO_IMAGE_HEIGHT;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;

		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
		const drawWidth = image.width * scale;
		const drawHeight = image.height * scale;
		const offsetX = (canvas.width - drawWidth) / 2;
		const offsetY = (canvas.height - drawHeight) / 2;
		ctx.filter = 'grayscale(1) contrast(1.25) brightness(0.92)';
		ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

		return dataUrlToBytes(canvas.toDataURL('image/png'));
	} catch {
		return null;
	}
}

export class HudImageController {
	private queue: Promise<void> = Promise.resolve();
	private lastUrl: string | null = null;

	constructor(private readonly bridge: EvenAppBridge) {}

	reset(): void {
		this.lastUrl = null;
	}

	async renderUrl(url: string | undefined): Promise<void> {
		if (!url || url === this.lastUrl) return;

		this.queue = this.queue.then(async () => {
			const bytes = await renderImageBytes(url);
			if (!bytes) return;
			const result = await this.bridge.updateImageRawData(
				new ImageRawDataUpdate({
					containerID: HERO_IMAGE_ID,
					containerName: HERO_IMAGE_NAME,
					imageData: bytes,
				}),
			);
			if (ImageRawDataUpdateResult.isSuccess(result)) {
				this.lastUrl = url;
			}
		});

		await this.queue;
	}
}

