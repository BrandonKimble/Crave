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
  const fullHeaderVisualModel =
    resultsPresentationControlLane.resultsPresentationOwner.shellModel.headerVisualModel;
  const headerVisualModel = React.useMemo(
    () => ({
      displayQuery: fullHeaderVisualModel.displayQuery,
      chromeMode: fullHeaderVisualModel.chromeMode,
      leadingIconMode: fullHeaderVisualModel.leadingIconMode,
      trailingActionMode: fullHeaderVisualModel.trailingActionMode,
      editable: fullHeaderVisualModel.editable,
    }),
    [
      fullHeaderVisualModel.chromeMode,
      fullHeaderVisualModel.displayQuery,
      fullHeaderVisualModel.editable,
      fullHeaderVisualModel.leadingIconMode,
      fullHeaderVisualModel.trailingActionMode,
    ]
  );

  return React.useMemo(
    () => ({
      headerVisualModel,
      shouldShowAutocompleteSpinnerInBar: suggestionRuntime.shouldShowAutocompleteSpinnerInBar,
      searchBarInputAnimatedStyle: visualRuntime.searchBarInputAnimatedStyle,
      searchBarContainerAnimatedStyle: visualRuntime.searchBarContainerAnimatedStyle,
      isSuggestionScrollDismissing:
        suggestionInteractionControlLane.suggestionInteractionRuntime.isSuggestionScrollDismissing,
      searchHeaderFocusProgress: suggestionRuntime.searchHeaderFocusProgress,
    }),
    [
      headerVisualModel,
      suggestionInteractionControlLane.suggestionInteractionRuntime.isSuggestionScrollDismissing,
      suggestionRuntime.searchHeaderFocusProgress,
      suggestionRuntime.shouldShowAutocompleteSpinnerInBar,
      visualRuntime.searchBarContainerAnimatedStyle,
      visualRuntime.searchBarInputAnimatedStyle,
    ]
  );
};
