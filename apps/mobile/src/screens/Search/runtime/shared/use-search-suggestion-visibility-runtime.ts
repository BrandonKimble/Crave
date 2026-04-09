import { useSearchSuggestionDisplayRuntime } from './use-search-suggestion-display-runtime';
import { useSearchSuggestionHoldRuntime } from './use-search-suggestion-hold-runtime';
import { useSearchSuggestionTransitionRuntime } from './use-search-suggestion-transition-runtime';
import type {
  SearchSuggestionDisplayRuntime,
  SearchSuggestionHoldRuntime,
  SearchSuggestionTransitionRuntime,
  SearchSuggestionVisibilityRuntime,
  UseSearchSuggestionSurfaceRuntimeArgs,
} from './use-search-suggestion-surface-runtime-contract';

export const useSearchSuggestionVisibilityRuntime = ({
  ...args
}: UseSearchSuggestionSurfaceRuntimeArgs): SearchSuggestionVisibilityRuntime => {
  const transitionRuntime: SearchSuggestionTransitionRuntime = useSearchSuggestionTransitionRuntime(
    {
      isSuggestionPanelActive: args.isSuggestionPanelActive,
    }
  );
  const displayRuntime: SearchSuggestionDisplayRuntime = useSearchSuggestionDisplayRuntime({
    query: args.query,
    suggestions: args.suggestions,
    recentSearches: args.recentSearches,
    recentlyViewedRestaurants: args.recentlyViewedRestaurants,
    recentlyViewedFoods: args.recentlyViewedFoods,
    isRecentLoading: args.isRecentLoading,
    isRecentlyViewedLoading: args.isRecentlyViewedLoading,
    isRecentlyViewedFoodsLoading: args.isRecentlyViewedFoodsLoading,
    isSuggestionPanelActive: args.isSuggestionPanelActive,
    isAutocompleteSuppressed: args.isAutocompleteSuppressed,
    isAutocompleteLoading: args.isAutocompleteLoading,
    isSuggestionPanelVisible: transitionRuntime.isSuggestionPanelVisible,
    shouldDriveSuggestionLayout: transitionRuntime.shouldDriveSuggestionLayout,
  });
  const holdRuntime: SearchSuggestionHoldRuntime = useSearchSuggestionHoldRuntime({
    query: args.query,
    suggestions: args.suggestions,
    recentSearches: args.recentSearches,
    recentlyViewedRestaurants: args.recentlyViewedRestaurants,
    recentlyViewedFoods: args.recentlyViewedFoods,
    isRecentLoading: args.isRecentLoading,
    isRecentlyViewedLoading: args.isRecentlyViewedLoading,
    isRecentlyViewedFoodsLoading: args.isRecentlyViewedFoodsLoading,
    isSuggestionPanelActive: args.isSuggestionPanelActive,
    setSuggestions: args.setSuggestions,
    setShowSuggestions: args.setShowSuggestions,
    setBeginSuggestionCloseHold: args.setBeginSuggestionCloseHold,
    setSearchTransitionVariant: transitionRuntime.setSearchTransitionVariant,
    isSuggestionPanelVisible: transitionRuntime.isSuggestionPanelVisible,
    shouldDriveSuggestionLayout: transitionRuntime.shouldDriveSuggestionLayout,
    shouldShowSuggestionBackground: displayRuntime.shouldShowSuggestionBackground,
    liveShouldRenderAutocompleteSection: displayRuntime.liveShouldRenderAutocompleteSection,
    liveShouldRenderRecentSection: displayRuntime.liveShouldRenderRecentSection,
    shouldShowAutocompleteSpinnerInBar: displayRuntime.shouldShowAutocompleteSpinnerInBar,
  });

  return {
    isSuggestionLayoutWarm: transitionRuntime.isSuggestionLayoutWarm,
    setIsSuggestionLayoutWarm: transitionRuntime.setIsSuggestionLayoutWarm,
    isSuggestionPanelVisible: transitionRuntime.isSuggestionPanelVisible,
    isSuggestionOverlayVisible: transitionRuntime.isSuggestionOverlayVisible,
    suggestionProgress: transitionRuntime.suggestionProgress,
    setSearchTransitionVariant: transitionRuntime.setSearchTransitionVariant,
    resetSubmitTransitionHold: holdRuntime.resetSubmitTransitionHold,
    beginSubmitTransition: holdRuntime.beginSubmitTransition,
    beginSuggestionCloseHold: holdRuntime.beginSuggestionCloseHold,
    shouldDriveSuggestionLayout: transitionRuntime.shouldDriveSuggestionLayout,
    shouldShowSuggestionBackground: holdRuntime.shouldShowSuggestionBackground,
    shouldShowSuggestionSurface: holdRuntime.shouldShowSuggestionSurface,
    shouldRenderSuggestionPanel: holdRuntime.shouldRenderSuggestionPanel,
    shouldRenderAutocompleteSection: holdRuntime.shouldRenderAutocompleteSection,
    shouldRenderRecentSection: holdRuntime.shouldRenderRecentSection,
    shouldShowAutocompleteSpinnerInBar: holdRuntime.shouldShowAutocompleteSpinnerInBar,
    suggestionDisplaySuggestions: holdRuntime.suggestionDisplaySuggestions,
    recentSearchesDisplay: holdRuntime.recentSearchesDisplay,
    recentlyViewedRestaurantsDisplay: holdRuntime.recentlyViewedRestaurantsDisplay,
    recentlyViewedFoodsDisplay: holdRuntime.recentlyViewedFoodsDisplay,
    hasRecentSearchesDisplay: holdRuntime.hasRecentSearchesDisplay,
    hasRecentlyViewedRestaurantsDisplay: holdRuntime.hasRecentlyViewedRestaurantsDisplay,
    hasRecentlyViewedFoodsDisplay: holdRuntime.hasRecentlyViewedFoodsDisplay,
    isRecentLoadingDisplay: holdRuntime.isRecentLoadingDisplay,
    isRecentlyViewedLoadingDisplay: holdRuntime.isRecentlyViewedLoadingDisplay,
    isRecentlyViewedFoodsLoadingDisplay: holdRuntime.isRecentlyViewedFoodsLoadingDisplay,
  };
};
