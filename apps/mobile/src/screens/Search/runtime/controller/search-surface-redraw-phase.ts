export type SearchSurfaceRedrawPhase =
  | 'idle'
  | 'redraw_committed'
  | 'markers_ready'
  | 'hydration_ready'
  | 'chrome_ready';

export const SEARCH_SURFACE_REDRAW_PHASE_ORDER: readonly SearchSurfaceRedrawPhase[] = [
  'idle',
  'redraw_committed',
  'markers_ready',
  'hydration_ready',
  'chrome_ready',
];

export const isSearchSurfaceRedrawDeferredChromePhase = (phase: SearchSurfaceRedrawPhase): boolean =>
  phase === 'markers_ready' ||
  phase === 'hydration_ready';

export const isSearchSurfaceRedrawVisibleAdmissionPhase = (
  phase: SearchSurfaceRedrawPhase
): boolean =>
  phase === 'redraw_committed' ||
  phase === 'markers_ready';
