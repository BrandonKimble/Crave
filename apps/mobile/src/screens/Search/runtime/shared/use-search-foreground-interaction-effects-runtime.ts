import React from 'react';

import type { SearchForegroundEffectsRuntimeArgs } from './search-foreground-interaction-runtime-contract';

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

  // F1031 family: this used to call registerPendingMutationWorkCancel directly in the render
  // body with no unregister — a side effect writable by a discarded render, and (worse) a
  // handler over this instance's closures that outlives unmount. Same defect F1326 fixed for
  // the perf-scenario command refs; same fix shape — register in an effect, restore the inert
  // no-op default on cleanup.
  React.useEffect(() => {
    registerPendingMutationWorkCancel(() => {
      cancelToggleInteraction();
    });
    return () => {
      registerPendingMutationWorkCancel(() => {});
    };
  }, [registerPendingMutationWorkCancel, cancelToggleInteraction]);
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
