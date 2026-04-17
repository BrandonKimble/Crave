import React from 'react';

import type {
  SearchForegroundEffectsRuntimeArgs,
  SearchForegroundInteractionRuntime,
  UseSearchForegroundInteractionRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';
import { useSearchForegroundEditingRuntime } from './use-search-foreground-editing-runtime';
import { useSearchForegroundLaunchIntentRuntime } from './use-search-foreground-launch-intent-runtime';
import { useSearchForegroundOverlayRuntime } from './use-search-foreground-overlay-runtime';
import { useSearchForegroundRetryRuntime } from './use-search-foreground-retry-runtime';
import { useSearchForegroundSubmitRuntime } from './use-search-foreground-submit-runtime';

export const useSearchForegroundInteractionRuntime = ({
  launchIntentArgs,
  submitRuntimeArgs,
  retryRuntimeArgs,
  editingRuntimeArgs,
  overlayRuntimeArgs,
  effectsRuntimeArgs,
  restaurantOnlyResolutionArgs,
}: UseSearchForegroundInteractionRuntimeArgs): SearchForegroundInteractionRuntime => {
  useSearchForegroundLaunchIntentRuntime(launchIntentArgs);

  const submitHandlers = useSearchForegroundSubmitRuntime(submitRuntimeArgs);

  const retryRuntime = useSearchForegroundRetryRuntime(retryRuntimeArgs);

  const editingHandlers = useSearchForegroundEditingRuntime(editingRuntimeArgs);

  const overlayHandlers = useSearchForegroundOverlayRuntime({
    ...overlayRuntimeArgs,
    submitHandlers: {
      handleRecentSearchPress: submitHandlers.handleRecentSearchPress,
      handleRecentlyViewedRestaurantPress: submitHandlers.handleRecentlyViewedRestaurantPress,
      handleRecentlyViewedFoodPress: submitHandlers.handleRecentlyViewedFoodPress,
    },
  });

  const applyForegroundInteractionEffects = React.useCallback(
    ({
      registerPendingMutationWorkCancel,
      cancelToggleInteraction,
      toggleOpenNowHarnessRef,
      toggleOpenNow,
      selectOverlayHarnessRef,
      selectOverlay,
    }: Pick<
      SearchForegroundEffectsRuntimeArgs,
      | 'registerPendingMutationWorkCancel'
      | 'cancelToggleInteraction'
      | 'toggleOpenNowHarnessRef'
      | 'toggleOpenNow'
      | 'selectOverlayHarnessRef'
    > & {
      selectOverlay: (target: 'search' | 'bookmarks' | 'profile') => void;
    }) => {
      toggleOpenNowHarnessRef.current = toggleOpenNow;
      selectOverlayHarnessRef.current = selectOverlay;
      registerPendingMutationWorkCancel(() => {
        cancelToggleInteraction();
      });
    },
    []
  );
  applyForegroundInteractionEffects({
    ...effectsRuntimeArgs,
    selectOverlay: overlayHandlers.handleOverlaySelect,
  });

  const {
    isSearchOverlay,
    saveSheetVisible,
    handleCloseSaveSheet,
    isSearchFocused,
    isSuggestionPanelActive,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    isSuggestionScreenActive,
    dismissTransientOverlays,
    hasResults,
    resetMapMoveFlag,
  } = effectsRuntimeArgs;
  const {
    hasResults: hasRestaurantOnlyResults,
    restaurantOnlySearchRef,
    restaurantResults,
    setRestaurantOnlyId,
  } = restaurantOnlyResolutionArgs;

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
    if (!hasRestaurantOnlyResults) {
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
  }, [hasRestaurantOnlyResults, restaurantOnlySearchRef, restaurantResults, setRestaurantOnlyId]);

  return {
    ...retryRuntime,
    ...submitHandlers,
    ...editingHandlers,
    ...overlayHandlers,
  };
};
