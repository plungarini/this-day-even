// splash.ts — Splash screen shown on glasses while the app is loading.
// createSplash takes a render callback that draws on a canvas context.

import { createSplash } from 'even-toolkit/splash';

export const appSplash = createSplash({
  render: (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('This Day', w / 2, h / 2);
  },
  tiles: 1,
  minTimeMs: 1500,
});