/** F1613: the ORDER is the definition — the union is derived from it, so a new phase cannot
 *  be added to the union without taking a position in the sequence the monotonic-advance guard
 *  indexes (phase-transition-runtime). One list, and the ordering rule can never go stale.
 *  RED recipe: add `'foo'` to the union by hand — there is no union to add it to; adding it to
 *  the array is the only way in, and the index map then covers it by construction. */
export const SEARCH_SURFACE_REDRAW_PHASE_ORDER = [
  'idle',
  'redraw_committed',
  'markers_ready',
  'hydration_ready',
  'chrome_ready',
] as const;

export type SearchSurfaceRedrawPhase = (typeof SEARCH_SURFACE_REDRAW_PHASE_ORDER)[number];

export const isSearchSurfaceRedrawDeferredChromePhase = (
  phase: SearchSurfaceRedrawPhase
): boolean => phase === 'markers_ready' || phase === 'hydration_ready';

export const isSearchSurfaceRedrawVisibleAdmissionPhase = (
  phase: SearchSurfaceRedrawPhase
): boolean => phase === 'redraw_committed' || phase === 'markers_ready';
