// selectors.ts — Screen router wiring.
// Maps route keys to GlassScreen instances. To add a screen: import it and add it here.
// onGlassAction is wrapped to drop the ctx param (void screens don't need it),
// matching the 3-arg signature useGlasses expects.

import { createGlassScreenRouter } from 'even-toolkit/glass-screen-router';
import type { GlassAction, GlassNavState } from 'even-toolkit/types';
import { homeScreen } from './screens/home/home';
import type { AppSnapshot } from './shared';

const { toDisplayData, onGlassAction: _onGlassAction } =
  createGlassScreenRouter<AppSnapshot, void>({ home: homeScreen }, 'home');

export { toDisplayData };

// Wrap to match useGlasses signature: (action, nav, snapshot) => GlassNavState
export const onGlassAction = (
  action: GlassAction,
  nav: GlassNavState,
  snapshot: AppSnapshot,
): GlassNavState => _onGlassAction(action, nav, snapshot, undefined);