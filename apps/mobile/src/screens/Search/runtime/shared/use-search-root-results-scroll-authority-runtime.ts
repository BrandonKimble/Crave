import React from 'react';

import type { SearchRootResultsScrollAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';
import { registerPerfScenarioCommands } from '../../../../perf/perf-scenario-command-registry';

type UseSearchRootResultsScrollAuthorityRuntimeArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
};

export const useSearchRootResultsScrollAuthorityRuntime = ({
  stateFoundationLane,
}: UseSearchRootResultsScrollAuthorityRuntimeArgs): SearchRootResultsScrollAuthorityRuntime => {
  const { rootPrimitivesRuntime } = stateFoundationLane;

  const resultsScrollPort = React.useMemo(
    () => ({
      // Command-bus verb (R2/R4 harness): deterministic list scroll — Maestro swipes are
      // consumed by the sheet's gesture handoff and cannot reliably reach the list bottom
      // (measured: 16 swipes ≈ 576px). animated:true emits the real onScroll stream, so the
      // pagination signal path (scrollOffset reaction → activity → offset-trigger) is exercised
      // exactly as a user scroll would.
      scrollResultsToOffset: (offsetY: number, animated: boolean) => {
        const listRef = rootPrimitivesRuntime.searchState.resultsScrollRef.current;
        if (!listRef?.scrollToOffset) {
          return false;
        }
        listRef.scrollToOffset({ offset: offsetY, animated });
        return true;
      },
      scrollResultsToTop: () => {
        const listRef = rootPrimitivesRuntime.searchState.resultsScrollRef.current;
        if (!listRef?.scrollToOffset) {
          return;
        }

        listRef.clearLayoutCacheOnUpdate?.();
        // ONE-WRITER LAW (residue-kill-plan item 12 #10, fixed 2026-08-08): the
        // track is the ONLY writer of the published sheetScrollOffset
        // (TrackSheetPage mirrors tau every UI frame). The direct
        // `sheetScrollOffset.value = 0` that used to sit here raced the track's
        // next mirror frame — a one-frame lie at best. The scrollToOffset below
        // moves the real list; the mirror follows tau on its own.
        requestAnimationFrame(() => {
          listRef.scrollToOffset?.({ offset: 0, animated: false });
        });
      },
    }),
    [rootPrimitivesRuntime.searchState.resultsScrollRef]
  );

  React.useEffect(
    () =>
      registerPerfScenarioCommands({
        scrollResults: ({ offsetY, animated }) =>
          resultsScrollPort.scrollResultsToOffset(offsetY, animated ?? true),
      }),
    [resultsScrollPort]
  );

  return React.useMemo(
    () => ({
      resultsScrollPort,
    }),
    [resultsScrollPort]
  );
};
