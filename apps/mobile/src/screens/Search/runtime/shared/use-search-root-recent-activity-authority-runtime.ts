import React from 'react';

import { useSearchRecentActivityRuntime } from './use-search-recent-activity-runtime';
import type { SearchRootRecentActivityAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

type UseSearchRootRecentActivityAuthorityRuntimeArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
};

export const useSearchRootRecentActivityAuthorityRuntime = ({
  stateFoundationLane,
}: UseSearchRootRecentActivityAuthorityRuntimeArgs): SearchRootRecentActivityAuthorityRuntime => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime, rootSuggestionRuntime } =
    stateFoundationLane;

  const recentActivityRuntime = useSearchRecentActivityRuntime({
    isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    isSuggestionPanelVisible: rootSuggestionRuntime.isSuggestionPanelVisible,
    searchHistoryRuntime: {
      updateLocalRecentSearches: rootDataPlaneRuntime.historyRuntime.updateLocalRecentSearches,
      trackRecentlyViewedRestaurant:
        rootDataPlaneRuntime.historyRuntime.trackRecentlyViewedRestaurant,
    },
  });

  return React.useMemo(
    () => ({
      recentActivityRuntime,
    }),
    [recentActivityRuntime]
  );
};
