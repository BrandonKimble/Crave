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
      // S4c token economy: the presentation episode token is (presentedWorldId,
      // presentingPhase) — a new resolution or commit between schedule and run makes
      // the token stale and the cleanup aborts.
      const scheduledEpisodeToken = `${scheduledState.presentedWorldId ?? 'world:none'}@${scheduledState.presentingPhase}`;
      const scheduledSurfaceResultsTransactionKey =
        scheduledSurfaceSnapshot.searchSurfaceResultsTransactionKey;
      const cleanupToken = [
        closeIntentId,
        scheduledEpisodeToken,
        scheduledSurfaceResultsTransactionKey ?? 'prepared:none',
      ].join('|');
      setPendingCloseIntentId(closeIntentId);
      activeCleanupTokenRef.current = cleanupToken;
      if (!matchesPendingCloseIntentId(closeIntentId)) {
        return;
      }
      const currentState = searchRuntimeBus.getState();
      const currentSurfaceSnapshot = getResultsPresentationSurfaceAuthority().getSnapshot();
      const currentEpisodeToken = `${currentState.presentedWorldId ?? 'world:none'}@${currentState.presentingPhase}`;
      if (
        activeCleanupTokenRef.current !== cleanupToken ||
        currentEpisodeToken !== scheduledEpisodeToken ||
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
