import React from 'react';

import type { SearchForegroundHeaderSearchBarLayoutInputs } from './search-foreground-chrome-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

export const useSearchRootOverlayHeaderSearchBarLayoutRuntime = ({
  stateFoundationLane,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
}): SearchForegroundHeaderSearchBarLayoutInputs => {
  const suggestionRuntime = stateFoundationLane.rootSuggestionRuntime;

  return React.useMemo(
    () => ({
      handleSearchContainerLayout: suggestionRuntime.handleSearchContainerLayout,
      handleSearchHeaderLayout: suggestionRuntime.handleSearchHeaderLayout,
    }),
    [suggestionRuntime.handleSearchContainerLayout, suggestionRuntime.handleSearchHeaderLayout]
  );
};
