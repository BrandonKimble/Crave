import React from 'react';

import { useSearchSuggestionHeldDisplayPresentationRuntime } from './use-search-suggestion-held-display-presentation-runtime';
import type {
  SearchSuggestionHeldDisplayRuntime,
  SearchSuggestionHeldDisplayRuntimeArgs,
} from './use-search-suggestion-surface-runtime-contract';

export const useSearchSuggestionHeldDisplayRuntime = ({
  suggestions,
  recentSearches,
  recentlyViewedRestaurants,
  recentlyViewedFoods,
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
  shouldDriveSuggestionLayout,
  shouldShowSuggestionBackground,
  liveShouldRenderAutocompleteSection,
  liveShouldRenderRecentSection,
  shouldShowAutocompleteSpinnerInBar,
  submitTransitionHoldRef,
  shouldFreezeSuggestionDisplayForSearchSurfaceRedraw,
}: SearchSuggestionHeldDisplayRuntimeArgs): SearchSuggestionHeldDisplayRuntime => {
  const isSuggestionClosing = isSuggestionPanelVisible && !isSuggestionPanelActive;
  const submitTransitionHold = submitTransitionHoldRef.current;
  const isSuggestionHoldActive = isSuggestionClosing && submitTransitionHold.active;

  const suggestionDisplaySuggestions = isSuggestionHoldActive
    ? submitTransitionHold.suggestions
    : suggestions;
  const recentSearchesDisplay = isSuggestionHoldActive
    ? submitTransitionHold.recentSearches
    : recentSearches;
  const recentlyViewedRestaurantsDisplay = isSuggestionHoldActive
    ? submitTransitionHold.recentlyViewedRestaurants
    : recentlyViewedRestaurants;
  const recentlyViewedFoodsDisplay = isSuggestionHoldActive
    ? submitTransitionHold.recentlyViewedFoods
    : recentlyViewedFoods;

  const shouldHoldAutocomplete = isSuggestionHoldActive && submitTransitionHold.holdAutocomplete;
  const shouldHoldRecent = isSuggestionHoldActive && submitTransitionHold.holdRecent;
  const shouldHoldSuggestionPanel =
    isSuggestionHoldActive && submitTransitionHold.holdSuggestionPanel;
  const shouldHoldSuggestionBackground =
    isSuggestionHoldActive && submitTransitionHold.holdSuggestionBackground;

  const shouldRenderRecentSection = shouldHoldRecent || liveShouldRenderRecentSection;
  const shouldRenderAutocompleteSection =
    shouldHoldAutocomplete || liveShouldRenderAutocompleteSection;
  const shouldRenderSuggestionPanel =
    shouldHoldSuggestionPanel || shouldRenderAutocompleteSection || shouldRenderRecentSection;

  const currentDisplayRuntime: SearchSuggestionHeldDisplayRuntime = {
    shouldShowSuggestionBackground:
      shouldShowSuggestionBackground || shouldHoldSuggestionBackground,
    shouldShowSuggestionSurface: shouldDriveSuggestionLayout,
    shouldRenderSuggestionPanel,
    shouldRenderAutocompleteSection,
    shouldRenderRecentSection,
    shouldShowAutocompleteSpinnerInBar,
    suggestionDisplaySuggestions,
    recentSearchesDisplay,
    recentlyViewedRestaurantsDisplay,
    recentlyViewedFoodsDisplay,
  };

  return useSearchSuggestionHeldDisplayPresentationRuntime({
    shouldFreezeSuggestionDisplayForSearchSurfaceRedraw,
    currentDisplayRuntime,
  });
};
