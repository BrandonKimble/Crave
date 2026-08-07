import { deriveSearchSuggestionDisplayRuntime } from './derive-search-suggestion-display-runtime';
import { useSearchSuggestionHeldDisplayRuntime } from './use-search-suggestion-held-display-runtime';
import { useSearchSuggestionHoldActionsRuntime } from './use-search-suggestion-hold-actions-runtime';
import { useSearchSuggestionHoldSyncRuntime } from './use-search-suggestion-hold-sync-runtime';
import { useSearchSuggestionHoldStateRuntime } from './use-search-suggestion-hold-state-runtime';
import { useSearchSuggestionLayoutWarmthRuntime } from './use-search-suggestion-layout-warmth-runtime';
import { useSearchSuggestionTransitionPresenceRuntime } from './use-search-suggestion-transition-presence-runtime';
import { useSearchSuggestionTransitionTimingRuntime } from './use-search-suggestion-transition-timing-runtime';
import type {
  SearchSuggestionDisplayRuntime,
  SearchSuggestionHoldActionRuntime,
  SearchSuggestionLayoutWarmthRuntime,
  SearchSuggestionTransitionPresenceRuntime,
  SearchSuggestionTransitionTimingRuntime,
  SearchSuggestionHeldDisplayRuntime,
  SearchSuggestionHoldEffectsRuntime,
  SearchSuggestionHoldStateRuntime,
  SearchSuggestionTransitionRuntime,
  SearchSuggestionVisibilityRuntime,
  UseSearchSuggestionSurfaceRuntimeArgs,
} from './search-suggestion-surface-runtime-contract';

type UseSearchSuggestionPresentationPlaneRuntimeArgs = UseSearchSuggestionSurfaceRuntimeArgs & {
  shouldFreezeSuggestionDisplayForSearchSurfaceRedraw: boolean;
};

export const useSearchSuggestionPresentationPlaneRuntime = ({
  ...args
}: UseSearchSuggestionPresentationPlaneRuntimeArgs): SearchSuggestionVisibilityRuntime => {
  const transitionTimingRuntime: SearchSuggestionTransitionTimingRuntime =
    useSearchSuggestionTransitionTimingRuntime();
  const transitionPresenceRuntime: SearchSuggestionTransitionPresenceRuntime =
    useSearchSuggestionTransitionPresenceRuntime({
      isSuggestionPanelActive: args.isSuggestionPanelActive,
      getSuggestionTransitionDurationMs: transitionTimingRuntime.getSuggestionTransitionDurationMs,
      getSuggestionTransitionEasing: transitionTimingRuntime.getSuggestionTransitionEasing,
      getSuggestionTransitionDelayMs: transitionTimingRuntime.getSuggestionTransitionDelayMs,
    });
  const layoutWarmthRuntime: SearchSuggestionLayoutWarmthRuntime =
    useSearchSuggestionLayoutWarmthRuntime({
      isSuggestionPanelActive: args.isSuggestionPanelActive,
      isSuggestionPanelVisible: transitionPresenceRuntime.isSuggestionPanelVisible,
    });
  const transitionRuntime: SearchSuggestionTransitionRuntime = {
    isSuggestionLayoutWarm: layoutWarmthRuntime.isSuggestionLayoutWarm,
    setIsSuggestionLayoutWarm: layoutWarmthRuntime.setIsSuggestionLayoutWarm,
    isSuggestionPanelVisible: transitionPresenceRuntime.isSuggestionPanelVisible,
    isSuggestionOverlayVisible: transitionPresenceRuntime.isSuggestionOverlayVisible,
    suggestionProgress: transitionPresenceRuntime.suggestionProgress,
    shouldDriveSuggestionLayout: layoutWarmthRuntime.shouldDriveSuggestionLayout,
  };
  const displayRuntime: SearchSuggestionDisplayRuntime = deriveSearchSuggestionDisplayRuntime({
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
  const holdActionRuntime: SearchSuggestionHoldActionRuntime =
    useSearchSuggestionHoldActionsRuntime({
      shouldDriveSuggestionLayout: transitionRuntime.shouldDriveSuggestionLayout,
      shouldShowSuggestionBackground: displayRuntime.shouldShowSuggestionBackground,
      liveShouldRenderAutocompleteSection: displayRuntime.liveShouldRenderAutocompleteSection,
      liveShouldRenderRecentSection: displayRuntime.liveShouldRenderRecentSection,
      captureSuggestionTransitionHold: holdStateRuntime.captureSuggestionTransitionHold,
    });

  useSearchSuggestionHoldSyncRuntime({
    query: args.query,
    isSuggestionPanelActive: args.isSuggestionPanelActive,
    setSuggestions: args.setSuggestions,
    setBeginSuggestionCloseHold: args.setBeginSuggestionCloseHold,
    shouldDriveSuggestionLayout: transitionRuntime.shouldDriveSuggestionLayout,
    resetSubmitTransitionHold: holdStateRuntime.resetSubmitTransitionHold,
    resetSubmitTransitionHoldIfQueryChanged:
      holdStateRuntime.resetSubmitTransitionHoldIfQueryChanged,
    beginSuggestionCloseHold: holdActionRuntime.beginSuggestionCloseHold,
  });

  const holdEffectsRuntime: SearchSuggestionHoldEffectsRuntime = {
    beginSubmitTransition: holdActionRuntime.beginSubmitTransition,
    beginSuggestionCloseHold: holdActionRuntime.beginSuggestionCloseHold,
  };
  const heldDisplayRuntime: SearchSuggestionHeldDisplayRuntime =
    useSearchSuggestionHeldDisplayRuntime({
      query: args.query,
      suggestions: args.suggestions,
      recentSearches: args.recentSearches,
      recentlyViewedRestaurants: args.recentlyViewedRestaurants,
      recentlyViewedFoods: args.recentlyViewedFoods,
      isSuggestionPanelActive: args.isSuggestionPanelActive,
      isSuggestionPanelVisible: transitionRuntime.isSuggestionPanelVisible,
      shouldDriveSuggestionLayout: transitionRuntime.shouldDriveSuggestionLayout,
      shouldShowSuggestionBackground: displayRuntime.shouldShowSuggestionBackground,
      liveShouldRenderAutocompleteSection: displayRuntime.liveShouldRenderAutocompleteSection,
      liveShouldRenderRecentSection: displayRuntime.liveShouldRenderRecentSection,
      shouldShowAutocompleteSpinnerInBar: displayRuntime.shouldShowAutocompleteSpinnerInBar,
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
    resetSubmitTransitionHold: holdStateRuntime.resetSubmitTransitionHold,
    beginSubmitTransition: holdEffectsRuntime.beginSubmitTransition,
    beginSuggestionCloseHold: holdEffectsRuntime.beginSuggestionCloseHold,
    shouldDriveSuggestionLayout: transitionRuntime.shouldDriveSuggestionLayout,
    shouldShowSuggestionBackground: heldDisplayRuntime.shouldShowSuggestionBackground,
    shouldShowSuggestionSurface: heldDisplayRuntime.shouldShowSuggestionSurface,
    shouldRenderSuggestionPanel: heldDisplayRuntime.shouldRenderSuggestionPanel,
    shouldRenderAutocompleteSection: heldDisplayRuntime.shouldRenderAutocompleteSection,
    shouldRenderRecentSection: heldDisplayRuntime.shouldRenderRecentSection,
    shouldShowAutocompleteSpinnerInBar: heldDisplayRuntime.shouldShowAutocompleteSpinnerInBar,
    suggestionDisplaySuggestions: heldDisplayRuntime.suggestionDisplaySuggestions,
    suggestionHighlightQueryDisplay: heldDisplayRuntime.suggestionHighlightQueryDisplay,
    recentSearchesDisplay: heldDisplayRuntime.recentSearchesDisplay,
    recentlyViewedRestaurantsDisplay: heldDisplayRuntime.recentlyViewedRestaurantsDisplay,
    recentlyViewedFoodsDisplay: heldDisplayRuntime.recentlyViewedFoodsDisplay,
  };
};
