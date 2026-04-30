import React from 'react';

import { useSearchSuggestionLayoutPlaneRuntime } from './use-search-suggestion-layout-plane-runtime';
import { useSearchSuggestionPresentationPlaneRuntime } from './use-search-suggestion-presentation-plane-runtime';
import type { SearchChromeScalarSurfacePresentationRuntime } from '../native/search-chrome-scalar-surface-presentation-runtime';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type {
  SearchRootDataPlaneRuntime,
  SearchRootSessionPrimitivesLane,
} from './use-search-root-session-runtime-contract';

type UseSearchRootSuggestionRuntimeArgs = {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSessionPrimitivesLane: SearchRootSessionPrimitivesLane;
  rootDataPlaneRuntime: SearchRootDataPlaneRuntime;
  searchChromeScalarSurfacePresentationRuntime?: SearchChromeScalarSurfacePresentationRuntime;
};

export const useSearchRootSuggestionRuntime = ({
  rootPrimitivesRuntime,
  rootSessionPrimitivesLane,
  rootDataPlaneRuntime,
  searchChromeScalarSurfacePresentationRuntime,
}: UseSearchRootSuggestionRuntimeArgs) => {
  const shouldFreezeSuggestionDisplayForRunOne =
    rootDataPlaneRuntime.freezeGate.isRunOneChromeFreezeActive ||
    rootDataPlaneRuntime.freezeGate.isRunOnePreflightFreezeActive ||
    rootDataPlaneRuntime.freezeGate.isResponseFrameFreezeActive;
  const suggestionPresentationPlaneRuntime = useSearchSuggestionPresentationPlaneRuntime({
    searchInteractionRef: rootSessionPrimitivesLane.primitives.searchInteractionRef,
    query: rootPrimitivesRuntime.searchState.query,
    suggestions: rootPrimitivesRuntime.searchState.suggestions,
    recentSearches: rootDataPlaneRuntime.historyRuntime.recentSearches,
    recentlyViewedRestaurants: rootDataPlaneRuntime.historyRuntime.recentlyViewedRestaurants,
    recentlyViewedFoods: rootDataPlaneRuntime.historyRuntime.recentlyViewedFoods,
    isRecentLoading: rootDataPlaneRuntime.historyRuntime.isRecentLoading,
    isRecentlyViewedLoading: rootDataPlaneRuntime.historyRuntime.isRecentlyViewedLoading,
    isRecentlyViewedFoodsLoading: rootDataPlaneRuntime.historyRuntime.isRecentlyViewedFoodsLoading,
    isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    isAutocompleteSuppressed: rootPrimitivesRuntime.searchState.isAutocompleteSuppressed,
    isAutocompleteLoading: rootDataPlaneRuntime.requestStatusRuntime.isAutocompleteLoading,
    setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
    setBeginSuggestionCloseHold: rootPrimitivesRuntime.searchState.setBeginSuggestionCloseHold,
    shouldFreezeSuggestionDisplayForRunOne,
    searchChromeScalarSurfacePresentationRuntime,
  });
  const suggestionLayoutPlaneRuntime = useSearchSuggestionLayoutPlaneRuntime({
    rootPrimitivesRuntime,
    rootSessionPrimitivesLane,
    suggestionVisibilityRuntime: suggestionPresentationPlaneRuntime,
  });

  const rootSuggestionRuntime = React.useMemo(
    () => ({
      ...suggestionPresentationPlaneRuntime,
      ...suggestionLayoutPlaneRuntime,
      isSuggestionScreenActive:
        rootPrimitivesRuntime.searchState.isSuggestionPanelActive ||
        suggestionPresentationPlaneRuntime.isSuggestionPanelVisible,
    }),
    [
      rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
      suggestionLayoutPlaneRuntime,
      suggestionPresentationPlaneRuntime,
    ]
  );

  return rootSuggestionRuntime;
};
