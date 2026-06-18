import React from 'react';

import type { SearchForegroundSuggestionPanelInputs } from './search-foreground-chrome-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

export const useSearchRootOverlaySuggestionPanelInputsRuntime = ({
  stateFoundationLane,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
}): SearchForegroundSuggestionPanelInputs => {
  const suggestionRuntime = stateFoundationLane.rootSuggestionRuntime;

  return React.useMemo(
    () => ({
      isSuggestionScreenActive: suggestionRuntime.isSuggestionScreenActive,
      shouldRenderSuggestionPanel: suggestionRuntime.shouldRenderSuggestionPanel,
      shouldRenderAutocompleteSection: suggestionRuntime.shouldRenderAutocompleteSection,
      shouldRenderRecentSection: suggestionRuntime.shouldRenderRecentSection,
    }),
    [
      suggestionRuntime.isSuggestionScreenActive,
      suggestionRuntime.shouldRenderAutocompleteSection,
      suggestionRuntime.shouldRenderRecentSection,
      suggestionRuntime.shouldRenderSuggestionPanel,
    ]
  );
};
