import React from 'react';

import type { SearchForegroundEffectsRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

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
};
