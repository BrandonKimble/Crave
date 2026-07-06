import React from 'react';

import type { SearchRootResultsScrollAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import { registerPerfScenarioCommands } from '../../../../perf/perf-scenario-command-registry';

type UseSearchRootResultsScrollAuthorityRuntimeArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
};

export const useSearchRootResultsScrollAuthorityRuntime = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
}: UseSearchRootResultsScrollAuthorityRuntimeArgs): SearchRootResultsScrollAuthorityRuntime => {
  const { rootPrimitivesRuntime } = stateFoundationLane;
  const { appRouteSharedSheetRuntimeOwner } = rootOverlayFoundationRuntime;

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
        appRouteSharedSheetRuntimeOwner.sheetScrollOffset.value = 0;
        requestAnimationFrame(() => {
          listRef.scrollToOffset?.({ offset: 0, animated: false });
        });
      },
    }),
    [
      rootPrimitivesRuntime.searchState.resultsScrollRef,
      appRouteSharedSheetRuntimeOwner.sheetScrollOffset,
    ]
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
