import React from 'react';

import type { SearchForegroundSuggestionDataInputs } from './search-foreground-chrome-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

export const useSearchRootOverlaySuggestionDataInputsRuntime = ({
  stateFoundationLane,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
}): SearchForegroundSuggestionDataInputs => {
  const suggestionRuntime = stateFoundationLane.rootSuggestionRuntime;

  return React.useMemo(
    () => ({
      suggestionDisplaySuggestions: suggestionRuntime.suggestionDisplaySuggestions,
      recentSearchesDisplay: suggestionRuntime.recentSearchesDisplay,
      recentlyViewedRestaurantsDisplay: suggestionRuntime.recentlyViewedRestaurantsDisplay,
      recentlyViewedFoodsDisplay: suggestionRuntime.recentlyViewedFoodsDisplay,
    }),
    [
      suggestionRuntime.recentSearchesDisplay,
      suggestionRuntime.recentlyViewedFoodsDisplay,
      suggestionRuntime.recentlyViewedRestaurantsDisplay,
      suggestionRuntime.suggestionDisplaySuggestions,
    ]
  );
};
