// home.ts — Logic container for the home screen (the component class).
// Owns the GlassScreen: action handling and data derivation.
// Delegates all rendering to HomeView — no display logic lives here.
// Nav state uses GlassNavState.highlightedIndex as the scroll position.

import type { GlassScreen } from 'even-toolkit/glass-screen-router';
import { moveHighlight, calcMaxScroll } from 'even-toolkit/glass-nav';
import { DEFAULT_CONTENT_SLOTS } from 'even-toolkit/glass-display-builders';
import { renderHomeView } from './HomeView';
import type { AppSnapshot } from '../../shared';

// C = void: this screen has no side-effect context (no navigate, no external actions).
export const homeScreen: GlassScreen<AppSnapshot, void> = {
  display(snapshot, nav) {
    return renderHomeView({
      message: snapshot.message,
      scrollPos: nav.highlightedIndex,
    });
  },

  action(action, nav, snapshot) {
    const maxScroll = calcMaxScroll([snapshot.message].length, DEFAULT_CONTENT_SLOTS);
    if (action.type === 'HIGHLIGHT_MOVE') {
      return { ...nav, highlightedIndex: moveHighlight(nav.highlightedIndex, action.direction, maxScroll) };
    }
    return nav;
  },
};