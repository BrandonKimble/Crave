import {
  resolveMapMovedEnterAdmission,
  shouldMarkMapMovedForBounds,
} from './search-map-movement-decisions';
import type { MapBounds } from '../../../types';

// F3906 / D78 — the STARTER, not a blanket. These two functions are the gate between a
// map gesture and the "search this area" reveal, and until this file they were verified
// only by eye: the finding's mutation (invert the skip_no_move branch) left all 40 suites
// green. Every case below is written so that severing the branch it names goes RED.

const boundsAround = (lat: number, lng: number, span = 0.02): MapBounds => ({
  northEast: { lat: lat + span, lng: lng + span },
  southWest: { lat: lat - span, lng: lng - span },
});

// ~0.1 mile is the MAP_MOVE_MIN_DISTANCE_MILES threshold; 1 deg latitude ~= 69 miles.
const MILE_IN_LAT_DEGREES = 1 / 69;

describe('resolveMapMovedEnterAdmission', () => {
  const admit = (patch: Partial<Parameters<typeof resolveMapMovedEnterAdmission>[0]> = {}) =>
    resolveMapMovedEnterAdmission({
      hasMapMovedSinceSearch: true,
      isMapGestureActive: false,
      isSearchInteracting: false,
      isAnySheetDragging: false,
      shouldDeferMapFromPressure: false,
      ...patch,
    });

  it('publishes when the map moved and nothing is in flight', () => {
    expect(admit()).toBe('publish_now');
  });

  it('skips when the map has not moved', () => {
    expect(admit({ hasMapMovedSinceSearch: false })).toBe('skip_no_move');
  });

  // The precedence that the finding's mutation attacked: no-move beats every deferral
  // reason, because there is nothing to defer. Reorder the branches and these four RED.
  it.each([
    ['a live map gesture', { isMapGestureActive: true }],
    ['search interaction', { isSearchInteracting: true }],
    ['a dragging sheet', { isAnySheetDragging: true }],
    ['map motion pressure', { shouldDeferMapFromPressure: true }],
  ])('still skips under %s when the map has not moved', (_reason, patch) => {
    expect(admit({ hasMapMovedSinceSearch: false, ...patch })).toBe('skip_no_move');
  });

  it.each([
    ['a live map gesture', { isMapGestureActive: true }],
    ['search interaction', { isSearchInteracting: true }],
    ['a dragging sheet', { isAnySheetDragging: true }],
    ['map motion pressure', { shouldDeferMapFromPressure: true }],
  ])('defers a real move under %s', (_reason, patch) => {
    expect(admit(patch)).toBe('defer_until_idle');
  });

  it('defers while any deferral reason holds, even with the others clear', () => {
    expect(
      admit({ isMapGestureActive: true, isSearchInteracting: true, isAnySheetDragging: true })
    ).toBe('defer_until_idle');
  });
});

describe('shouldMarkMapMovedForBounds', () => {
  const baseline = boundsAround(30.27, -97.74);

  it('stays marked once moved, even when the viewport returns to the baseline', () => {
    // Stickiness is the point: the flag is cleared by a SEARCH, never by panning back.
    expect(
      shouldMarkMapMovedForBounds({
        hasMapMovedSinceSearch: true,
        nextBounds: baseline,
        searchBaselineBounds: baseline,
        fallbackBaselineBounds: baseline,
      })
    ).toBe(true);
  });

  it('does not mark a viewport that has not meaningfully left the search baseline', () => {
    expect(
      shouldMarkMapMovedForBounds({
        hasMapMovedSinceSearch: false,
        nextBounds: boundsAround(30.2701, -97.7401),
        searchBaselineBounds: baseline,
        fallbackBaselineBounds: null,
      })
    ).toBe(false);
  });

  it('marks a viewport that moved significantly from the search baseline', () => {
    expect(
      shouldMarkMapMovedForBounds({
        hasMapMovedSinceSearch: false,
        nextBounds: boundsAround(30.27 + 10 * MILE_IN_LAT_DEGREES, -97.74),
        searchBaselineBounds: baseline,
        fallbackBaselineBounds: null,
      })
    ).toBe(true);
  });

  it('falls back to a plain centre-distance test when there is no search baseline', () => {
    expect(
      shouldMarkMapMovedForBounds({
        hasMapMovedSinceSearch: false,
        nextBounds: boundsAround(30.27 + 1 * MILE_IN_LAT_DEGREES, -97.74),
        searchBaselineBounds: null,
        fallbackBaselineBounds: baseline,
      })
    ).toBe(true);
  });

  it('leaves a sub-threshold fallback move unmarked', () => {
    expect(
      shouldMarkMapMovedForBounds({
        hasMapMovedSinceSearch: false,
        nextBounds: boundsAround(30.27 + 0.01 * MILE_IN_LAT_DEGREES, -97.74),
        searchBaselineBounds: null,
        fallbackBaselineBounds: baseline,
      })
    ).toBe(false);
  });

  it('marks nothing when neither baseline exists', () => {
    // No baseline is not "moved" — it is "no question asked yet".
    expect(
      shouldMarkMapMovedForBounds({
        hasMapMovedSinceSearch: false,
        nextBounds: baseline,
        searchBaselineBounds: null,
        fallbackBaselineBounds: null,
      })
    ).toBe(false);
  });
});
