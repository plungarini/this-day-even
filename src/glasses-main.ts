import { OsEventTypeList, type EvenHubEvent, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { toMonthDayKey } from '../shared/utc';
import { loadToday } from './api/today';
import { getApiBaseUrl } from './config';
import { HudImageController } from './glasses/image-controller';
import { HudSession } from './glasses/session';
import type { HudViewState } from './glasses/types';
import { createErrorHudState, createLoadingHudState, createReadyHudState, resetHudState, stepHudState, toHudRenderState, touchHudClock } from './glasses/view';

let state: HudViewState = createLoadingHudState();
let bridgeRef: Awaited<ReturnType<typeof waitForEvenAppBridge>> | null = null;
let session: HudSession | null = null;
let imageController: HudImageController | null = null;
let currentLayoutKey = '';

function resolveEventType(event: EvenHubEvent) {
	return event.textEvent?.eventType ?? event.sysEvent?.eventType ?? event.listEvent?.eventType;
}

async function render(): Promise<void> {
	if (!session) return;
	const next = toHudRenderState(state);
	const layoutChanged = next.layout.key !== currentLayoutKey;
	await session.render(next);
	currentLayoutKey = next.layout.key;

	if (next.imageUrl && imageController) {
		if (layoutChanged) imageController.reset();
		await imageController.renderUrl(next.imageUrl);
	}
}

async function refreshPayload(): Promise<void> {
	try {
		const payload = await loadToday(getApiBaseUrl());
		state = createReadyHudState(payload);
	} catch (error) {
		state = createErrorHudState(error instanceof Error ? error.message : 'Could not load the daily artifact.');
	}
	await render();
}

async function handleEvent(event: EvenHubEvent): Promise<void> {
	if (!bridgeRef) return;
	const type = resolveEventType(event);

	if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
		await bridgeRef.shutDownPageContainer(1);
		return;
	}

	if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
		state = stepHudState(state, 1);
		await render();
		return;
	}

	if (type === OsEventTypeList.SCROLL_TOP_EVENT) {
		state = stepHudState(state, -1);
		await render();
		return;
	}

	if (type === OsEventTypeList.CLICK_EVENT || type === undefined) {
		state = resetHudState(state);
		await render();
	}
}

async function boot(): Promise<void> {
	try {
		bridgeRef = await waitForEvenAppBridge();
		session = new HudSession(bridgeRef);
		imageController = new HudImageController(bridgeRef);
		bridgeRef.onEvenHubEvent((event) => {
			void handleEvent(event);
		});
		await render();
		await refreshPayload();

		window.setInterval(() => {
			const currentKey = state.payload?.key;
			if (currentKey && currentKey !== toMonthDayKey(new Date())) {
				void refreshPayload();
				return;
			}

			state = touchHudClock(state);
			void render();
		}, 60_000);
	} catch {
		// The WebView can still render when the bridge is unavailable.
	}
}

void boot();
