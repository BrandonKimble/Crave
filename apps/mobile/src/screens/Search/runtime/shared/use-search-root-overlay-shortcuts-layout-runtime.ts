import React from 'react';

import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

export const useSearchRootOverlayShortcutsLayoutRuntime = ({
  stateFoundationLane,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
}) => {
  const suggestionRuntime = stateFoundationLane.rootSuggestionRuntime;

  return React.useMemo(
    () => ({
      handleSearchShortcutsRowLayout:
        suggestionRuntime.handleSearchShortcutsRowLayout,
      handleRestaurantsShortcutLayout:
        suggestionRuntime.handleRestaurantsShortcutLayout,
      handleDishesShortcutLayout:
        suggestionRuntime.handleDishesShortcutLayout,
    }),
    [
      suggestionRuntime.handleDishesShortcutLayout,
      suggestionRuntime.handleRestaurantsShortcutLayout,
      suggestionRuntime.handleSearchShortcutsRowLayout,
    ]
  );
};
