// AppGlasses.tsx — The single React component owning the glasses connection.
// Mount once at the app root. Reads route + snapshot, sends display to glasses.
// useGlasses returns void — it manages the connection lifecycle internally.
// Renders nothing visible in the web UI.

import { useCallback } from 'react';
import { useGlasses } from 'even-toolkit/useGlasses';
import { toDisplayData, onGlassAction } from './selectors';
import { appSplash } from './splash';
import type { AppSnapshot } from './shared';

interface Props {
  snapshot: AppSnapshot;
}

export function AppGlasses({ snapshot }: Props) {
  // Wrap snapshot in a stable getter so the hook always reads the latest value.
  const getSnapshot = useCallback(() => snapshot, [snapshot]);

  useGlasses({
    getSnapshot,
    toDisplayData,
    onGlassAction,
    deriveScreen: () => 'home',
    appName: 'This Day',
    splash: appSplash,
  });

  return null;
}