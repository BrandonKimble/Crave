import { makeMutable } from 'react-native-reanimated';

// The RESULTS-ROWS VISIBILITY LEVEL (owner directive 2026-07-07: every loading state is a
// TRUE CUTOUT). While a loading cover is up, the rows beneath it hide — opacity only, so
// they keep mounting and measuring (row readiness still commits from the list layout) —
// and the cutout skeleton's holes become real windows down to the hoisted frosted map
// instead of needing a self-frost fallback over stale rows. ONE writer: the surface
// overlay runtime, keyed to the same surfaceMode values that drive the cover itself, so
// the hide and the cover flip in the same frame. The toggle STRIP is the list HEADER,
// not a row, so it stays visible + tappable through an interaction reload (mid-flight
// chip re-taps must keep coalescing through the coordinator).
export const resultsRowsVisibleValue = makeMutable(1);

export const setResultsRowsHiddenForLoading = (hidden: boolean): void => {
  resultsRowsVisibleValue.value = hidden ? 0 : 1;
};
