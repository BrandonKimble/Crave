import React from 'react';

import type { SearchForegroundSuggestionScrollInputs } from './search-foreground-chrome-contract';
import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';
import type { SearchRootSuggestionInteractionControlLane } from './search-root-control-plane-runtime-contract';

export const useSearchRootOverlaySuggestionScrollInputsRuntime = ({
  stateFoundationLane,
  suggestionInteractionControlLane,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
  suggestionInteractionControlLane: SearchRootSuggestionInteractionControlLane;
}): SearchForegroundSuggestionScrollInputs => {
  const suggestionRuntime = stateFoundationLane.rootSuggestionRuntime;

  return React.useMemo(
    () => ({
      onSuggestionScroll: suggestionRuntime.suggestionScrollHandler,
      onSuggestionTouchStart:
        suggestionInteractionControlLane.suggestionInteractionRuntime.handleSuggestionTouchStart,
      onSuggestionContentSizeChange: suggestionRuntime.handleSuggestionContentSizeChange,
      onSuggestionInteractionStart:
        suggestionInteractionControlLane.suggestionInteractionRuntime
          .handleSuggestionInteractionStart,
      onSuggestionInteractionEnd:
        suggestionInteractionControlLane.suggestionInteractionRuntime
          .handleSuggestionInteractionEnd,
    }),
    [
      suggestionInteractionControlLane.suggestionInteractionRuntime.handleSuggestionInteractionEnd,
      suggestionInteractionControlLane.suggestionInteractionRuntime
        .handleSuggestionInteractionStart,
      suggestionInteractionControlLane.suggestionInteractionRuntime.handleSuggestionTouchStart,
      suggestionRuntime.handleSuggestionContentSizeChange,
      suggestionRuntime.suggestionScrollHandler,
    ]
  );
};
