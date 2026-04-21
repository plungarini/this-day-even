// HomeView.ts — Pure display function for the home screen.
// Receives pre-processed HomeViewData, returns DisplayData for the glasses.
// No logic, no snapshot access, no side effects — only rendering (the component template).

import { buildScrollableContent } from 'even-toolkit/glass-display-builders';
import { buildStaticActionBar } from 'even-toolkit/action-bar';
import type { DisplayData } from 'even-toolkit/types';

export interface HomeViewData {
  message: string;
  scrollPos: number;
}

export function renderHomeView(data: HomeViewData): DisplayData {
  return buildScrollableContent({
    title: 'Home',
    actionBar: buildStaticActionBar(['Select'], 0),
    contentLines: [data.message],
    scrollPos: data.scrollPos,
  });
}