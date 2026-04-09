import { useSearchSuggestionHeldDisplayRuntime } from './use-search-suggestion-held-display-runtime';
import { useSearchSuggestionHoldEffectsRuntime } from './use-search-suggestion-hold-effects-runtime';
import { useSearchSuggestionHoldStateRuntime } from './use-search-suggestion-hold-state-runtime';
import type {
  SearchSuggestionHeldDisplayRuntime,
  SearchSuggestionHoldEffectsRuntime,
  SearchSuggestionHoldRuntime,
  SearchSuggestionHoldRuntimeArgs,
  SearchSuggestionHoldStateRuntime,
} from './use-search-suggestion-surface-runtime-contract';

export const useSearchSuggestionHoldRuntime = ({
  query,
  suggestions,
  recentSearches,
  recentlyViewedRestaurants,
  recentlyViewedFoods,
  isRecentLoading,
  isRecentlyViewedLoading,
  isRecentlyViewedFoodsLoading,
  isSuggestionPanelActive,
  setSuggestions,
  setShowSuggestions,
  setBeginSuggestionCloseHold,
  setSearchTransitionVariant,
  isSuggestionPanelVisible,
  shouldDriveSuggestionLayout,
  shouldShowSuggestionBackground,
  liveShouldRenderAutocompleteSection,
  liveShouldRenderRecentSection,
  shouldShowAutocompleteSpinnerInBar,
}: SearchSuggestionHoldRuntimeArgs): SearchSuggestionHoldRuntime => {
  const holdStateRuntime: SearchSuggestionHoldStateRuntime = useSearchSuggestionHoldStateRuntime({
    query,
    suggestions,
    recentSearches,
    recentlyViewedRestaurants,
    recentlyViewedFoods,
    isRecentLoading,
    isRecentlyViewedLoading,
    isRecentlyViewedFoodsLoading,
  });

  const holdEffectsRuntime: SearchSuggestionHoldEffectsRuntime =
    useSearchSuggestionHoldEffectsRuntime({
      query,
      isSuggestionPanelActive,
      setSuggestions,
      setShowSuggestions,
      setBeginSuggestionCloseHold,
      setSearchTransitionVariant,
      shouldDriveSuggestionLayout,
      shouldShowSuggestionBackground,
      liveShouldRenderAutocompleteSection,
      liveShouldRenderRecentSection,
      resetSubmitTransitionHold: holdStateRuntime.resetSubmitTransitionHold,
      resetSubmitTransitionHoldIfQueryChanged:
        holdStateRuntime.resetSubmitTransitionHoldIfQueryChanged,
      captureSuggestionTransitionHold: holdStateRuntime.captureSuggestionTransitionHold,
    });

  const heldDisplayRuntime: SearchSuggestionHeldDisplayRuntime =
    useSearchSuggestionHeldDisplayRuntime({
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
      submitTransitionHoldRef: holdStateRuntime.submitTransitionHoldRef,
    });

  return {
    resetSubmitTransitionHold: holdStateRuntime.resetSubmitTransitionHold,
    beginSubmitTransition: holdEffectsRuntime.beginSubmitTransition,
    beginSuggestionCloseHold: holdEffectsRuntime.beginSuggestionCloseHold,
    ...heldDisplayRuntime,
  };
};
