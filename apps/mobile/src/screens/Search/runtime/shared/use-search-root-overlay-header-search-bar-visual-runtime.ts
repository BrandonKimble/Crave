import React from 'react';

import type { SearchForegroundHeaderSearchBarVisualInputs } from './search-foreground-chrome-contract';
import type {
  SearchRootResultsPresentationControlLane,
  SearchRootSuggestionInteractionControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootOverlayHeaderSearchBarVisualRuntime } from './search-root-visual-runtime-contract';

export const useSearchRootOverlayHeaderSearchBarVisualRuntime = ({
  stateFoundationLane,
  suggestionInteractionControlLane,
  resultsPresentationControlLane,
  visualRuntime,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
  suggestionInteractionControlLane: SearchRootSuggestionInteractionControlLane;
  resultsPresentationControlLane: SearchRootResultsPresentationControlLane;
  visualRuntime: SearchRootOverlayHeaderSearchBarVisualRuntime;
}): SearchForegroundHeaderSearchBarVisualInputs => {
  const suggestionRuntime = stateFoundationLane.rootSuggestionRuntime;

  return React.useMemo(
    () => ({
      headerVisualModel:
        resultsPresentationControlLane.resultsPresentationOwner.shellModel
          .headerVisualModel,
      shouldShowAutocompleteSpinnerInBar:
        suggestionRuntime.shouldShowAutocompleteSpinnerInBar,
      searchBarInputAnimatedStyle: visualRuntime.searchBarInputAnimatedStyle,
      searchBarContainerAnimatedStyle:
        visualRuntime.searchBarContainerAnimatedStyle,
      isSuggestionScrollDismissing:
        suggestionInteractionControlLane.suggestionInteractionRuntime
          .isSuggestionScrollDismissing,
      searchHeaderFocusProgress: suggestionRuntime.searchHeaderFocusProgress,
    }),
    [
      resultsPresentationControlLane.resultsPresentationOwner.shellModel
        .headerVisualModel,
      suggestionInteractionControlLane.suggestionInteractionRuntime
        .isSuggestionScrollDismissing,
      suggestionRuntime.searchHeaderFocusProgress,
      suggestionRuntime.shouldShowAutocompleteSpinnerInBar,
      visualRuntime.searchBarContainerAnimatedStyle,
      visualRuntime.searchBarInputAnimatedStyle,
    ]
  );
};
