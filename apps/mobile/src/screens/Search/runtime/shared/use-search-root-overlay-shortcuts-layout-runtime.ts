import React from 'react';

import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';

export const useSearchRootOverlayShortcutsLayoutRuntime = ({
  stateFoundationLane,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
}) => {
  const suggestionRuntime = stateFoundationLane.rootSuggestionRuntime;

  return React.useMemo(
    () => ({
      handleSearchShortcutsRowLayout: suggestionRuntime.handleSearchShortcutsRowLayout,
      handleRestaurantsShortcutLayout: suggestionRuntime.handleRestaurantsShortcutLayout,
    }),
    [
      suggestionRuntime.handleRestaurantsShortcutLayout,
      suggestionRuntime.handleSearchShortcutsRowLayout,
    ]
  );
};
