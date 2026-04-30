import React from 'react';

import type { SearchRootResultsScrollAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

type UseSearchRootResultsScrollAuthorityRuntimeArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
};

export const useSearchRootResultsScrollAuthorityRuntime = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
}: UseSearchRootResultsScrollAuthorityRuntimeArgs): SearchRootResultsScrollAuthorityRuntime => {
  const { rootPrimitivesRuntime } = stateFoundationLane;
  const { appRouteResultsSheetRuntimeOwner } = rootOverlayFoundationRuntime;

  const resultsScrollPort = React.useMemo(
    () => ({
      scrollResultsToTop: () => {
        const listRef = rootPrimitivesRuntime.searchState.resultsScrollRef.current;
        if (!listRef?.scrollToOffset) {
          return;
        }

        listRef.clearLayoutCacheOnUpdate?.();
        appRouteResultsSheetRuntimeOwner.resultsScrollOffset.value = 0;
        requestAnimationFrame(() => {
          listRef.scrollToOffset?.({ offset: 0, animated: false });
        });
      },
    }),
    [
      rootPrimitivesRuntime.searchState.resultsScrollRef,
      appRouteResultsSheetRuntimeOwner.resultsScrollOffset,
    ]
  );

  return React.useMemo(
    () => ({
      resultsScrollPort,
    }),
    [resultsScrollPort]
  );
};
