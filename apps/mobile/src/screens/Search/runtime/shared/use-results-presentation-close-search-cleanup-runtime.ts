import React from 'react';
import { Keyboard } from 'react-native';

import type { SearchRuntimeBus } from './search-runtime-bus';
import { getResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';

type UseResultsPresentationCloseSearchCleanupRuntimeArgs<Suggestion> = {
  searchRuntimeBus: SearchRuntimeBus;
  cancelActiveSearchRequest: () => void;
  cancelAutocomplete: () => void;
  handleCancelPendingMutationWork: () => void;
  resetSubmitTransitionHold: () => void;
  resultsRuntimeOwner: {
    cancelToggleInteraction: () => void;
  };
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAutocompleteSuppressed: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuggestions: React.Dispatch<React.SetStateAction<Suggestion[]>>;
  inputRef: React.RefObject<{ blur?: () => void } | null>;
  setPendingCloseIntentId: (intentId: string | null) => void;
  matchesPendingCloseIntentId: (intentId: string) => boolean;
};

type ResultsPresentationCloseSearchCleanupRuntime = {
  scheduleCloseSearchCleanup: (closeIntentId: string) => void;
  cancelCloseSearchCleanup: () => void;
};

export const useResultsPresentationCloseSearchCleanupRuntime = <Suggestion>({
  searchRuntimeBus,
  cancelActiveSearchRequest,
  cancelAutocomplete,
  handleCancelPendingMutationWork,
  resetSubmitTransitionHold,
  resultsRuntimeOwner,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setIsAutocompleteSuppressed,
  setShowSuggestions,
  setQuery,
  setError,
  setSuggestions,
  inputRef,
  setPendingCloseIntentId,
  matchesPendingCloseIntentId,
}: UseResultsPresentationCloseSearchCleanupRuntimeArgs<Suggestion>): ResultsPresentationCloseSearchCleanupRuntime => {
  const activeCleanupTokenRef = React.useRef<string | null>(null);

  const cancelCloseSearchCleanup = React.useCallback(() => {
    activeCleanupTokenRef.current = null;
  }, []);

  React.useEffect(
    () => () => {
      cancelCloseSearchCleanup();
    },
    [cancelCloseSearchCleanup]
  );

  const scheduleCloseSearchCleanup = React.useCallback(
    (closeIntentId: string) => {
      const scheduledState = searchRuntimeBus.getState();
      const scheduledSurfaceSnapshot = getResultsPresentationSurfaceAuthority().getSnapshot();
      const scheduledOperationId = scheduledState.activeOperationId;
      const scheduledSurfaceResultsTransactionKey =
        scheduledSurfaceSnapshot.searchSurfaceResultsTransactionKey;
      const cleanupToken = [
        closeIntentId,
        scheduledOperationId ?? 'operation:none',
        scheduledSurfaceResultsTransactionKey ?? 'prepared:none',
      ].join('|');
      setPendingCloseIntentId(closeIntentId);
      activeCleanupTokenRef.current = cleanupToken;
      if (!matchesPendingCloseIntentId(closeIntentId)) {
        return;
      }
      const currentState = searchRuntimeBus.getState();
      const currentSurfaceSnapshot = getResultsPresentationSurfaceAuthority().getSnapshot();
      if (
        activeCleanupTokenRef.current !== cleanupToken ||
        currentState.activeOperationId !== scheduledOperationId ||
        currentSurfaceSnapshot.searchSurfaceResultsTransactionKey !==
          scheduledSurfaceResultsTransactionKey
      ) {
        setPendingCloseIntentId(null);
        return;
      }

      cancelActiveSearchRequest();
      cancelAutocomplete();
      handleCancelPendingMutationWork();
      resetSubmitTransitionHold();
      resultsRuntimeOwner.cancelToggleInteraction();
      setIsSearchFocused(false);
      setIsSuggestionPanelActive(false);
      setIsAutocompleteSuppressed(true);
      setShowSuggestions(false);
      setQuery('');
      setError(null);
      setSuggestions([]);
      Keyboard.dismiss();
      inputRef.current?.blur?.();
    },
    [
      cancelActiveSearchRequest,
      cancelAutocomplete,
      cancelCloseSearchCleanup,
      handleCancelPendingMutationWork,
      inputRef,
      matchesPendingCloseIntentId,
      resetSubmitTransitionHold,
      resultsRuntimeOwner,
      searchRuntimeBus,
      setError,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setPendingCloseIntentId,
      setQuery,
      setShowSuggestions,
      setSuggestions,
    ]
  );

  return React.useMemo(
    () => ({
      scheduleCloseSearchCleanup,
      cancelCloseSearchCleanup,
    }),
    [cancelCloseSearchCleanup, scheduleCloseSearchCleanup]
  );
};
