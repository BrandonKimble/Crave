import { useSearchRequestPresentationFlowRuntime } from './use-search-request-presentation-flow-runtime';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';

type UseSearchRootRecentActivityArgsRuntimeArgs = {
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
};

export type SearchRootRecentActivityArgsRuntime = Parameters<
  typeof useSearchRequestPresentationFlowRuntime
>[0]['recentActivityArgs'];

export const useSearchRootRecentActivityArgsRuntime = ({
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
}: UseSearchRootRecentActivityArgsRuntimeArgs): SearchRootRecentActivityArgsRuntime => ({
  isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
  isSuggestionPanelVisible: rootSuggestionRuntime.isSuggestionPanelVisible,
  searchHistoryRuntime: {
    updateLocalRecentSearches: rootSessionRuntime.historyRuntime.updateLocalRecentSearches,
    trackRecentlyViewedRestaurant: rootSessionRuntime.historyRuntime.trackRecentlyViewedRestaurant,
  },
});
