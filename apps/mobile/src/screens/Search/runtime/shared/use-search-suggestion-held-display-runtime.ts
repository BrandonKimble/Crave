import type {
  SearchSuggestionHeldDisplayRuntime,
  SearchSuggestionHeldDisplayRuntimeArgs,
} from './use-search-suggestion-surface-runtime-contract';

export const useSearchSuggestionHeldDisplayRuntime = ({
  suggestions,
  recentSearches,
  recentlyViewedRestaurants,
  recentlyViewedFoods,
  isRecentLoading,
  isRecentlyViewedLoading,
  isRecentlyViewedFoodsLoading,
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
  shouldDriveSuggestionLayout,
  shouldShowSuggestionBackground,
  liveShouldRenderAutocompleteSection,
  liveShouldRenderRecentSection,
  shouldShowAutocompleteSpinnerInBar,
  submitTransitionHoldRef,
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
  const isRecentLoadingDisplay = isSuggestionHoldActive
    ? submitTransitionHold.isRecentLoading
    : isRecentLoading;
  const isRecentlyViewedLoadingDisplay = isSuggestionHoldActive
    ? submitTransitionHold.isRecentlyViewedLoading
    : isRecentlyViewedLoading;
  const isRecentlyViewedFoodsLoadingDisplay = isSuggestionHoldActive
    ? submitTransitionHold.isRecentlyViewedFoodsLoading
    : isRecentlyViewedFoodsLoading;

  const hasRecentSearchesDisplay = recentSearchesDisplay.length > 0;
  const hasRecentlyViewedRestaurantsDisplay = recentlyViewedRestaurantsDisplay.length > 0;
  const hasRecentlyViewedFoodsDisplay = recentlyViewedFoodsDisplay.length > 0;

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

  return {
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
    hasRecentSearchesDisplay,
    hasRecentlyViewedRestaurantsDisplay,
    hasRecentlyViewedFoodsDisplay,
    isRecentLoadingDisplay,
    isRecentlyViewedLoadingDisplay,
    isRecentlyViewedFoodsLoadingDisplay,
  };
};
