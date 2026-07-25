import React from 'react';

import { useSearchSuggestionHeldDisplayPresentationRuntime } from './use-search-suggestion-held-display-presentation-runtime';
import type {
  SearchSuggestionHeldDisplayRuntime,
  SearchSuggestionHeldDisplayRuntimeArgs,
} from './use-search-suggestion-surface-runtime-contract';

export const useSearchSuggestionHeldDisplayRuntime = ({
  query,
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
  // Refit layer 2 (match highlighting): the bold split must track the SAME query
  // the displayed rows were fetched for — held rows keep the held query.
  const suggestionHighlightQueryDisplay = isSuggestionHoldActive
    ? submitTransitionHold.query
    : query;
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
    suggestionHighlightQueryDisplay,
    recentSearchesDisplay,
    recentlyViewedRestaurantsDisplay,
    recentlyViewedFoodsDisplay,
  };

  return useSearchSuggestionHeldDisplayPresentationRuntime({
    shouldFreezeSuggestionDisplayForSearchSurfaceRedraw,
    currentDisplayRuntime,
  });
};
