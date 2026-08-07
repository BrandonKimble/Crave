import React from 'react';

import { useSearchRootOverlayHeaderWarmupRuntime } from './use-search-root-overlay-header-warmup-runtime';
import type { SearchRootSearchStateRuntime } from './search-root-primitives-runtime-contract';

type SearchRootOverlayHeaderWarmupSourceRuntime = {
  hiddenSearchFiltersWarmupProps: ReturnType<typeof useSearchRootOverlayHeaderWarmupRuntime>;
};

export const useSearchRootOverlayHeaderWarmupSourceRuntime = ({
  searchState,
}: {
  searchState: SearchRootSearchStateRuntime;
}): SearchRootOverlayHeaderWarmupSourceRuntime => {
  const hiddenSearchFiltersWarmupProps = useSearchRootOverlayHeaderWarmupRuntime({
    searchState,
  });

  return React.useMemo(
    () => ({
      hiddenSearchFiltersWarmupProps,
    }),
    [hiddenSearchFiltersWarmupProps]
  );
};
