import React from 'react';

import type { SearchForegroundSuggestionSelectionInputs } from './search-foreground-chrome-contract';
import type { SearchRootForegroundInteractionControlLane } from './use-search-root-control-plane-runtime-contract';

export const useSearchRootOverlaySuggestionSelectionInputsRuntime = ({
  foregroundInteractionControlLane,
}: {
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
}): SearchForegroundSuggestionSelectionInputs =>
  React.useMemo(
    () => ({
      onSuggestionPress:
        foregroundInteractionControlLane.foregroundInteractionRuntime.handleSuggestionPress,
      onRecentSearchPress:
        foregroundInteractionControlLane.foregroundInteractionRuntime.handleRecentSearchPress,
      onRecentlyViewedRestaurantPress:
        foregroundInteractionControlLane.foregroundInteractionRuntime
          .handleRecentlyViewedRestaurantPress,
      onRecentlyViewedFoodPress:
        foregroundInteractionControlLane.foregroundInteractionRuntime.handleRecentlyViewedFoodPress,
      onRecentViewMorePress:
        foregroundInteractionControlLane.foregroundInteractionRuntime.handleRecentViewMorePress,
      onRecentlyViewedMorePress:
        foregroundInteractionControlLane.foregroundInteractionRuntime.handleRecentlyViewedMorePress,
    }),
    [
      foregroundInteractionControlLane.foregroundInteractionRuntime.handleRecentSearchPress,
      foregroundInteractionControlLane.foregroundInteractionRuntime.handleRecentViewMorePress,
      foregroundInteractionControlLane.foregroundInteractionRuntime.handleRecentlyViewedFoodPress,
      foregroundInteractionControlLane.foregroundInteractionRuntime.handleRecentlyViewedMorePress,
      foregroundInteractionControlLane.foregroundInteractionRuntime
        .handleRecentlyViewedRestaurantPress,
      foregroundInteractionControlLane.foregroundInteractionRuntime.handleSuggestionPress,
    ]
  );
