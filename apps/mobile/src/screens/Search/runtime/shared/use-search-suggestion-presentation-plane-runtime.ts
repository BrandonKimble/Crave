import { useSearchSuggestionDisplayRuntime } from './use-search-suggestion-display-runtime';
import { useSearchSuggestionHeldDisplayRuntime } from './use-search-suggestion-held-display-runtime';
import { useSearchSuggestionHoldEffectsRuntime } from './use-search-suggestion-hold-effects-runtime';
import { useSearchSuggestionHoldStateRuntime } from './use-search-suggestion-hold-state-runtime';
import { useSearchSuggestionTransitionRuntime } from './use-search-suggestion-transition-runtime';
import type {
  SearchSuggestionDisplayRuntime,
  SearchSuggestionHeldDisplayRuntime,
  SearchSuggestionHoldEffectsRuntime,
  SearchSuggestionHoldStateRuntime,
  SearchSuggestionTransitionRuntime,
  SearchSuggestionVisibilityRuntime,
  UseSearchSuggestionSurfaceRuntimeArgs,
} from './use-search-suggestion-surface-runtime-contract';

type UseSearchSuggestionPresentationPlaneRuntimeArgs = UseSearchSuggestionSurfaceRuntimeArgs & {
  shouldFreezeSuggestionDisplayForSearchSurfaceRedraw: boolean;
};

export const useSearchSuggestionPresentationPlaneRuntime = ({
  ...args
}: UseSearchSuggestionPresentationPlaneRuntimeArgs): SearchSuggestionVisibilityRuntime => {
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
    isSuggestionPanelActive: args.isSuggestionPanelActive,
    isAutocompleteSuppressed: args.isAutocompleteSuppressed,
    isAutocompleteLoading: args.isAutocompleteLoading,
    isSuggestionPanelVisible: transitionRuntime.isSuggestionPanelVisible,
    shouldDriveSuggestionLayout: transitionRuntime.shouldDriveSuggestionLayout,
  });
  const holdStateRuntime: SearchSuggestionHoldStateRuntime = useSearchSuggestionHoldStateRuntime({
    query: args.query,
    suggestions: args.suggestions,
    recentSearches: args.recentSearches,
    recentlyViewedRestaurants: args.recentlyViewedRestaurants,
    recentlyViewedFoods: args.recentlyViewedFoods,
  });
  const holdEffectsRuntime: SearchSuggestionHoldEffectsRuntime =
    useSearchSuggestionHoldEffectsRuntime({
      query: args.query,
      isSuggestionPanelActive: args.isSuggestionPanelActive,
      setSuggestions: args.setSuggestions,
      setShowSuggestions: args.setShowSuggestions,
      setBeginSuggestionCloseHold: args.setBeginSuggestionCloseHold,
      setSearchTransitionVariant: transitionRuntime.setSearchTransitionVariant,
      shouldDriveSuggestionLayout: transitionRuntime.shouldDriveSuggestionLayout,
      shouldShowSuggestionBackground: displayRuntime.shouldShowSuggestionBackground,
      liveShouldRenderAutocompleteSection:
        displayRuntime.liveShouldRenderAutocompleteSection,
      liveShouldRenderRecentSection: displayRuntime.liveShouldRenderRecentSection,
      resetSubmitTransitionHold: holdStateRuntime.resetSubmitTransitionHold,
      resetSubmitTransitionHoldIfQueryChanged:
        holdStateRuntime.resetSubmitTransitionHoldIfQueryChanged,
      captureSuggestionTransitionHold: holdStateRuntime.captureSuggestionTransitionHold,
    });
  const heldDisplayRuntime: SearchSuggestionHeldDisplayRuntime =
    useSearchSuggestionHeldDisplayRuntime({
      suggestions: args.suggestions,
      recentSearches: args.recentSearches,
      recentlyViewedRestaurants: args.recentlyViewedRestaurants,
      recentlyViewedFoods: args.recentlyViewedFoods,
      isSuggestionPanelActive: args.isSuggestionPanelActive,
      isSuggestionPanelVisible: transitionRuntime.isSuggestionPanelVisible,
      shouldDriveSuggestionLayout: transitionRuntime.shouldDriveSuggestionLayout,
      shouldShowSuggestionBackground: displayRuntime.shouldShowSuggestionBackground,
      liveShouldRenderAutocompleteSection:
        displayRuntime.liveShouldRenderAutocompleteSection,
      liveShouldRenderRecentSection: displayRuntime.liveShouldRenderRecentSection,
      shouldShowAutocompleteSpinnerInBar:
        displayRuntime.shouldShowAutocompleteSpinnerInBar,
      submitTransitionHoldRef: holdStateRuntime.submitTransitionHoldRef,
      shouldFreezeSuggestionDisplayForSearchSurfaceRedraw:
        args.shouldFreezeSuggestionDisplayForSearchSurfaceRedraw,
    });

  return {
    isSuggestionLayoutWarm: transitionRuntime.isSuggestionLayoutWarm,
    setIsSuggestionLayoutWarm: transitionRuntime.setIsSuggestionLayoutWarm,
    isSuggestionPanelVisible: transitionRuntime.isSuggestionPanelVisible,
    isSuggestionOverlayVisible: transitionRuntime.isSuggestionOverlayVisible,
    suggestionProgress: transitionRuntime.suggestionProgress,
    setSearchTransitionVariant: transitionRuntime.setSearchTransitionVariant,
    resetSubmitTransitionHold: holdStateRuntime.resetSubmitTransitionHold,
    beginSubmitTransition: holdEffectsRuntime.beginSubmitTransition,
    beginSuggestionCloseHold: holdEffectsRuntime.beginSuggestionCloseHold,
    shouldDriveSuggestionLayout: transitionRuntime.shouldDriveSuggestionLayout,
    shouldShowSuggestionBackground: heldDisplayRuntime.shouldShowSuggestionBackground,
    shouldShowSuggestionSurface: heldDisplayRuntime.shouldShowSuggestionSurface,
    shouldRenderSuggestionPanel: heldDisplayRuntime.shouldRenderSuggestionPanel,
    shouldRenderAutocompleteSection:
      heldDisplayRuntime.shouldRenderAutocompleteSection,
    shouldRenderRecentSection: heldDisplayRuntime.shouldRenderRecentSection,
    shouldShowAutocompleteSpinnerInBar:
      heldDisplayRuntime.shouldShowAutocompleteSpinnerInBar,
    suggestionDisplaySuggestions: heldDisplayRuntime.suggestionDisplaySuggestions,
    recentSearchesDisplay: heldDisplayRuntime.recentSearchesDisplay,
    recentlyViewedRestaurantsDisplay:
      heldDisplayRuntime.recentlyViewedRestaurantsDisplay,
    recentlyViewedFoodsDisplay: heldDisplayRuntime.recentlyViewedFoodsDisplay,
  };
};
