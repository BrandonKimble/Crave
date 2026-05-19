import React from 'react';

import type {
  SearchForegroundEffectsRuntimeArgs,
  SearchForegroundRestaurantOnlyResolutionArgs,
} from './use-search-foreground-interaction-runtime-contract';

export type SearchForegroundInteractionRouteEffectsRuntimeArgs = Pick<
  SearchForegroundEffectsRuntimeArgs,
  | 'isSearchOverlay'
  | 'saveSheetVisibleRef'
  | 'handleCloseSaveSheet'
  | 'isSearchFocused'
  | 'isSuggestionPanelActive'
  | 'setIsSearchFocused'
  | 'setIsSuggestionPanelActive'
  | 'isSuggestionScreenActive'
  | 'dismissTransientOverlays'
  | 'hasResults'
  | 'resetMapMoveFlag'
>;

type UseSearchForegroundInteractionEffectsRuntimeArgs = {
  effectsRuntimeArgs: SearchForegroundInteractionRouteEffectsRuntimeArgs;
  restaurantOnlyResolutionArgs: SearchForegroundRestaurantOnlyResolutionArgs;
};

type UseSearchForegroundInteractionRenderRegistrationRuntimeArgs = {
  effectsRuntimeArgs: Pick<
    SearchForegroundEffectsRuntimeArgs,
    'registerPendingMutationWorkCancel' | 'cancelToggleInteraction'
  >;
};

export const useSearchForegroundInteractionRenderRegistrationRuntime = ({
  effectsRuntimeArgs,
}: UseSearchForegroundInteractionRenderRegistrationRuntimeArgs): void => {
  const { registerPendingMutationWorkCancel, cancelToggleInteraction } = effectsRuntimeArgs;

  registerPendingMutationWorkCancel(() => {
    cancelToggleInteraction();
  });
};

export const useSearchForegroundInteractionEffectsRuntime = ({
  effectsRuntimeArgs,
  restaurantOnlyResolutionArgs,
}: UseSearchForegroundInteractionEffectsRuntimeArgs): void => {
  const {
    isSearchOverlay,
    saveSheetVisibleRef,
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
    if (!isSearchOverlay && saveSheetVisibleRef.current.saveSheetState.visible) {
      handleCloseSaveSheet();
    }
  }, [handleCloseSaveSheet, isSearchOverlay, saveSheetVisibleRef]);

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
};
