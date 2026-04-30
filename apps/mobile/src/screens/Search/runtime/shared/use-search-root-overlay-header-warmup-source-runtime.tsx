import React from 'react';

import { useSearchRootOverlayHeaderWarmupRuntime } from './use-search-root-overlay-header-warmup-runtime';
import type { SearchRootSearchStateRuntime } from './search-root-primitives-runtime-contract';
import type { SearchRootFilterModalControlLane } from './use-search-root-control-plane-runtime-contract';

type SearchRootOverlayHeaderWarmupSourceRuntime = {
  hiddenSearchFiltersWarmupProps: ReturnType<
    typeof useSearchRootOverlayHeaderWarmupRuntime
  >;
};

export const useSearchRootOverlayHeaderWarmupSourceRuntime = ({
  filterModalControlLane,
  searchState,
}: {
  filterModalControlLane: SearchRootFilterModalControlLane;
  searchState: SearchRootSearchStateRuntime;
}): SearchRootOverlayHeaderWarmupSourceRuntime => {
  const hiddenSearchFiltersWarmupProps =
    useSearchRootOverlayHeaderWarmupRuntime({
      filterModalControlLane,
      searchState,
    });

  return React.useMemo(
    () => ({
      hiddenSearchFiltersWarmupProps,
    }),
    [hiddenSearchFiltersWarmupProps]
  );
};
