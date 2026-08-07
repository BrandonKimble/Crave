import type { OverlaySheetSnap } from '../../../../overlays/types';
import type { SearchCloseTransitionState } from './results-presentation-shell-contract';

export const createSearchCloseTransitionState = (
  closeIntentId: string
): Exclude<SearchCloseTransitionState, null> => ({
  closeIntentId,
  mapExitSettled: false,
  sheetCollapsedReached: false,
  sheetCollapsedSettled: false,
});

// F1033(b): the dismiss finalize is NOT jointly gated on map-exit — the native exit-ack
// path has no functional consumer, only telemetry (`mapExitSettled` is read by
// `selectReleaseReadyCloseSnapshot`'s `isResultsExitMapSettled` for the perf-attribution
// event, never for the finalize decision, which is driven entirely by
// `sheetCollapsedSettled`). This used to return `{ nextState, shouldFinalize }` where
// `shouldFinalize` was `isSearchCloseTransitionReadyToFinalize(nextState)` — decided
// entirely by a flag (`sheetCollapsedSettled`) this function does not touch — and its one
// caller (`markSearchSheetCloseMapExitSettled`) discarded it, reading only `nextState`.
// Renamed + narrowed to what it actually is: a telemetry-only state update.
//
// F6001: the same narrowing now applies to `applySearchCloseSheetSettled` below,
// which was the second, untreated instance of exactly this shape — and it also
// took the exported `isSearchCloseTransitionReadyToFinalize` predicate with it.
// That predicate's only reference in the repo was inside the discarded field, so
// the file's one self-description of "terminal" was decided by nobody. The real
// finalize decision lives at the release effect in
// use-results-presentation-close-transition-state-runtime.ts, which reads
// `releaseReadyCloseSnapshot.isResultsExitCollapsedSettled` — a question this
// module cannot answer, because it has no view of the surface policy.
export const applySearchCloseMapExitSettledForTelemetry = ({
  current,
  closeIntentId,
}: {
  current: SearchCloseTransitionState;
  closeIntentId: string;
}): SearchCloseTransitionState => {
  if (!current || current.closeIntentId !== closeIntentId || current.mapExitSettled) {
    return current;
  }
  return {
    ...current,
    mapExitSettled: true,
  };
};

export const applySearchCloseCollapsedReached = ({
  current,
  closeIntentId,
  snap,
}: {
  current: SearchCloseTransitionState;
  closeIntentId: string | null;
  snap: OverlaySheetSnap;
}): SearchCloseTransitionState => {
  if (snap !== 'collapsed' || !closeIntentId) {
    return current;
  }
  if (!current || current.closeIntentId !== closeIntentId || current.sheetCollapsedReached) {
    return current;
  }
  return {
    ...current,
    sheetCollapsedReached: true,
  };
};

export const applySearchCloseSheetSettled = ({
  current,
  closeIntentId,
  snap,
}: {
  current: SearchCloseTransitionState;
  closeIntentId: string | null;
  snap: OverlaySheetSnap;
}): SearchCloseTransitionState => {
  if (snap !== 'collapsed' || !closeIntentId) {
    return current;
  }
  if (!current || current.closeIntentId !== closeIntentId || current.sheetCollapsedSettled) {
    return current;
  }
  return {
    ...current,
    sheetCollapsedReached: true,
    sheetCollapsedSettled: true,
  };
};
