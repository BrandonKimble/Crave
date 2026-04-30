import React from 'react';

import type { SearchForegroundSuggestionStatusInputs } from './search-foreground-chrome-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

export const useSearchRootOverlaySuggestionStatusInputsRuntime = ({
  stateFoundationLane,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
}): SearchForegroundSuggestionStatusInputs => {
  const suggestionRuntime = stateFoundationLane.rootSuggestionRuntime;

  return React.useMemo(
    () => ({
      hasRecentSearchesDisplay: suggestionRuntime.hasRecentSearchesDisplay,
      hasRecentlyViewedRestaurantsDisplay:
        suggestionRuntime.hasRecentlyViewedRestaurantsDisplay,
      hasRecentlyViewedFoodsDisplay:
        suggestionRuntime.hasRecentlyViewedFoodsDisplay,
      isRecentLoadingDisplay: suggestionRuntime.isRecentLoadingDisplay,
      isRecentlyViewedLoadingDisplay:
        suggestionRuntime.isRecentlyViewedLoadingDisplay,
      isRecentlyViewedFoodsLoadingDisplay:
        suggestionRuntime.isRecentlyViewedFoodsLoadingDisplay,
    }),
    [
      suggestionRuntime.hasRecentSearchesDisplay,
      suggestionRuntime.hasRecentlyViewedFoodsDisplay,
      suggestionRuntime.hasRecentlyViewedRestaurantsDisplay,
      suggestionRuntime.isRecentLoadingDisplay,
      suggestionRuntime.isRecentlyViewedFoodsLoadingDisplay,
      suggestionRuntime.isRecentlyViewedLoadingDisplay,
    ]
  );
};
