import {
	CreateStartUpPageContainer,
	RebuildPageContainer,
	StartUpPageCreateResult,
	TextContainerUpgrade,
	type EvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import type { HudRenderState } from './types';
import { instantiateLayout } from './utils';

let pageCreated = false;
let activeLayoutKey: string | null = null;
let lastContents: Record<string, string> = {};

export class HudSession {
	constructor(private readonly bridge: EvenAppBridge) {}

	async render(next: HudRenderState): Promise<void> {
		const params = instantiateLayout(next.layout, next.textContents);

		if (!pageCreated) {
			let created: StartUpPageCreateResult;
			try {
				created = await this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(params));
			} catch {
				return;
			}

			if (created === StartUpPageCreateResult.success) {
				pageCreated = true;
				activeLayoutKey = next.layout.key;
				lastContents = { ...next.textContents };
				return;
			}

			const takeover = await this.bridge.rebuildPageContainer(new RebuildPageContainer(params));
			if (takeover) {
				pageCreated = true;
				activeLayoutKey = next.layout.key;
				lastContents = { ...next.textContents };
			}
			return;
		}

		if (activeLayoutKey !== next.layout.key) {
			const ok = await this.bridge.rebuildPageContainer(new RebuildPageContainer(params));
			if (!ok) return;
			activeLayoutKey = next.layout.key;
			lastContents = {};
		}

		for (const descriptor of next.layout.textDescriptors) {
			const content = next.textContents[descriptor.containerName] ?? '';
			if (lastContents[descriptor.containerName] === content) continue;
			const previousLength = lastContents[descriptor.containerName]?.length ?? 0;
			const ok = await this.bridge.textContainerUpgrade(
				new TextContainerUpgrade({
					containerID: descriptor.containerID,
					containerName: descriptor.containerName,
					contentOffset: 0,
					contentLength: Math.max(previousLength, content.length),
					content,
				}),
			);
			if (ok) lastContents[descriptor.containerName] = content;
		}
	}
}

