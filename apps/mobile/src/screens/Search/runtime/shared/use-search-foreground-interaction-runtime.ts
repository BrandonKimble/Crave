import React from 'react';

import type {
  SearchForegroundInteractionRuntime,
  UseSearchForegroundInteractionRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';
import { useSearchForegroundEditingRuntime } from './use-search-foreground-editing-runtime';
import { useSearchForegroundLaunchIntentRuntime } from './use-search-foreground-launch-intent-runtime';
import { useSearchForegroundOverlayRuntime } from './use-search-foreground-overlay-runtime';
import { useSearchForegroundRetryRuntime } from './use-search-foreground-retry-runtime';
import { useSearchForegroundSubmitRuntime } from './use-search-foreground-submit-runtime';

export const useSearchForegroundInteractionRuntime = ({
  navigation,
  routeSearchIntent,
  activeMainIntent,
  consumeActiveMainIntent,
  userLocation,
  submitRuntime,
  clearOwner,
  query,
  submittedQuery,
  searchMode,
  activeTab,
  hasResults,
  isOffline,
  isSearchLoading,
  isLoadingMore,
  isSearchSessionActive,
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
  shouldTreatSearchAsResults,
  shouldShowDockedPolls,
  showPollsOverlay,
  rootOverlay,
  profilePresentationActive,
  overlayRuntimeController,
  openRestaurantProfilePreview,
  closeRestaurantProfile,
  captureSearchSessionOrigin,
  captureSearchSessionQuery,
  ensureSearchOverlay,
  restoreDockedPolls,
  dismissTransientOverlays,
  suppressAutocompleteResults,
  allowAutocompleteResults,
  cancelAutocomplete,
  dismissSearchKeyboard,
  beginSubmitTransition,
  beginSuggestionCloseHold,
  beginSuggestionCloseHoldRef,
  requestSearchPresentationIntent,
  resetFocusedMapState,
  resetMapMoveFlag,
  resetSearchHeaderFocusProgress,
  resetSubmitTransitionHold,
  beginCloseSearch,
  setOverlaySwitchInFlight,
  setTabOverlaySnapRequest,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setShowSuggestions,
  setSuggestions,
  setQuery,
  setRestaurantOnlyIntent,
  setIsAutocompleteSuppressed,
  setIsSuggestionLayoutWarm,
  setSearchTransitionVariant,
  registerPendingMutationWorkCancel,
  cancelToggleInteraction,
  toggleOpenNowHarnessRef,
  toggleOpenNow,
  isSearchOverlay,
  isSearchFocused,
  isSuggestionScreenActive,
  pendingRestaurantSelectionRef,
  restaurantOnlySearchRef,
  restaurantResults,
  searchSessionQueryRef,
  isSearchEditingRef,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
  inputRef,
  deferRecentSearchUpsert,
  setRestaurantOnlyId,
  saveSheetVisible,
  handleCloseSaveSheet,
}: UseSearchForegroundInteractionRuntimeArgs): SearchForegroundInteractionRuntime => {
  useSearchForegroundLaunchIntentRuntime({
    navigation,
    activeMainIntent,
    consumeActiveMainIntent,
    openRestaurantProfilePreview,
  });

  const submitHandlers = useSearchForegroundSubmitRuntime({
    submitRuntime,
    query,
    submittedQuery,
    searchMode,
    activeTab,
    hasResults,
    isSearchLoading,
    isLoadingMore,
    isSearchSessionActive,
    isSuggestionPanelActive,
    shouldShowDockedPolls,
    captureSearchSessionOrigin,
    ensureSearchOverlay,
    suppressAutocompleteResults,
    cancelAutocomplete,
    dismissSearchKeyboard,
    beginSubmitTransition,
    resetFocusedMapState,
    resetMapMoveFlag,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
    setQuery,
    setRestaurantOnlyIntent,
    pendingRestaurantSelectionRef,
    isSearchEditingRef,
    allowSearchBlurExitRef,
    ignoreNextSearchBlurRef,
    deferRecentSearchUpsert,
    openRestaurantProfilePreview,
  });

  const retryRuntime = useSearchForegroundRetryRuntime({
    submitRuntime,
    query,
    submittedQuery,
    hasResults,
    isOffline,
    isSearchLoading,
    isLoadingMore,
    isSearchSessionActive,
  });

  const editingHandlers = useSearchForegroundEditingRuntime({
    clearOwner,
    query,
    submittedQuery,
    hasResults,
    isSearchLoading,
    isLoadingMore,
    isSearchSessionActive,
    isSuggestionPanelActive,
    isSuggestionPanelVisible,
    shouldTreatSearchAsResults,
    showPollsOverlay,
    profilePresentationActive,
    captureSearchSessionQuery,
    dismissTransientOverlays,
    allowAutocompleteResults,
    suppressAutocompleteResults,
    cancelAutocomplete,
    beginSuggestionCloseHold,
    requestSearchPresentationIntent,
    beginCloseSearch,
    restoreDockedPolls,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
    setQuery,
    setIsAutocompleteSuppressed,
    searchSessionQueryRef,
    isSearchEditingRef,
    allowSearchBlurExitRef,
    ignoreNextSearchBlurRef,
    inputRef,
  });

  const overlayHandlers = useSearchForegroundOverlayRuntime({
    navigation,
    routeSearchIntent,
    userLocation,
    rootOverlay,
    profilePresentationActive,
    overlayRuntimeController,
    closeRestaurantProfile,
    dismissTransientOverlays,
    beginSuggestionCloseHoldRef,
    setOverlaySwitchInFlight,
    setTabOverlaySnapRequest,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
    setIsAutocompleteSuppressed,
    setIsSuggestionLayoutWarm,
    setSearchTransitionVariant,
    ignoreNextSearchBlurRef,
    allowSearchBlurExitRef,
    inputRef,
    cancelAutocomplete,
    resetSearchHeaderFocusProgress,
    resetSubmitTransitionHold,
    submitHandlers: {
      handleRecentSearchPress: submitHandlers.handleRecentSearchPress,
      handleRecentlyViewedRestaurantPress: submitHandlers.handleRecentlyViewedRestaurantPress,
      handleRecentlyViewedFoodPress: submitHandlers.handleRecentlyViewedFoodPress,
    },
  });

  toggleOpenNowHarnessRef.current = toggleOpenNow;
  registerPendingMutationWorkCancel(() => {
    cancelToggleInteraction();
  });

  React.useEffect(() => {
    if (!isSearchOverlay && saveSheetVisible) {
      handleCloseSaveSheet();
    }
  }, [handleCloseSaveSheet, isSearchOverlay, saveSheetVisible]);

  React.useEffect(() => {
    if (!isSearchOverlay && !isSuggestionPanelActive) {
      setIsSearchFocused(false);
    }
  }, [isSearchOverlay, isSuggestionPanelActive, setIsSearchFocused]);

  React.useEffect(() => {
    if (isSearchFocused && !isSuggestionPanelActive) {
      setIsSuggestionPanelActive(true);
    }
  }, [isSearchFocused, isSuggestionPanelActive, setIsSuggestionPanelActive]);

  React.useEffect(() => {
    if (isSuggestionScreenActive) {
      dismissTransientOverlays();
    }
  }, [dismissTransientOverlays, isSuggestionScreenActive]);

  React.useEffect(() => {
    if (!hasResults) {
      resetMapMoveFlag();
    }
  }, [hasResults, resetMapMoveFlag]);

  React.useEffect(() => {
    if (!hasResults) {
      setRestaurantOnlyId(null);
      return;
    }
    const intent = restaurantOnlySearchRef.current;
    if (!intent) {
      setRestaurantOnlyId(null);
      return;
    }
    const hasMatch = restaurantResults?.some(
      (restaurant: { restaurantId: string }) => restaurant.restaurantId === intent
    );
    setRestaurantOnlyId(hasMatch ? intent : null);
  }, [hasResults, restaurantOnlySearchRef, restaurantResults, setRestaurantOnlyId]);

  return {
    ...retryRuntime,
    ...submitHandlers,
    ...editingHandlers,
    ...overlayHandlers,
  };
};
