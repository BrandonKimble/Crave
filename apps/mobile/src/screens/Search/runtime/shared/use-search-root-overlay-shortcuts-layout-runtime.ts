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
      handleShortcutChipLayout: suggestionRuntime.handleShortcutChipLayout,
      handleSearchShortcutsScroll: suggestionRuntime.handleSearchShortcutsScroll,
    }),
    [
      suggestionRuntime.handleShortcutChipLayout,
      suggestionRuntime.handleSearchShortcutsScroll,
      suggestionRuntime.handleSearchShortcutsRowLayout,
    ]
  );
};
