import React from 'react';
import { Keyboard } from 'react-native';

import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';

type UseResultsPresentationOwnerCloseSearchCleanupRuntimeArgs<Suggestion> = {
  cancelActiveSearchRequest: () => void;
  cancelAutocomplete: () => void;
  handleCancelPendingMutationWork: () => void;
  resetSubmitTransitionHold: () => void;
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
  resultsRuntimeOwner: Pick<ResultsPresentationRuntimeOwner, 'cancelToggleInteraction'>;
};

export const useResultsPresentationOwnerCloseSearchCleanupRuntime = <Suggestion>({
  cancelActiveSearchRequest,
  cancelAutocomplete,
  handleCancelPendingMutationWork,
  resetSubmitTransitionHold,
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
  resultsRuntimeOwner,
}: UseResultsPresentationOwnerCloseSearchCleanupRuntimeArgs<Suggestion>) => {
  const pendingCloseCleanupFrameRef = React.useRef<number | null>(null);

  const cancelCloseSearchCleanup = React.useCallback(() => {
    const pendingFrame = pendingCloseCleanupFrameRef.current;
    if (pendingFrame != null) {
      cancelAnimationFrame(pendingFrame);
      pendingCloseCleanupFrameRef.current = null;
    }
  }, []);

  React.useEffect(
    () => () => {
      cancelCloseSearchCleanup();
    },
    [cancelCloseSearchCleanup]
  );

  const scheduleCloseSearchCleanup = React.useCallback(
    (closeIntentId: string) => {
      setPendingCloseIntentId(closeIntentId);
      cancelCloseSearchCleanup();
      pendingCloseCleanupFrameRef.current = requestAnimationFrame(() => {
        pendingCloseCleanupFrameRef.current = null;
        if (!matchesPendingCloseIntentId(closeIntentId)) {
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
      });
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
      cancelCloseSearchCleanup,
      scheduleCloseSearchCleanup,
    }),
    [cancelCloseSearchCleanup, scheduleCloseSearchCleanup]
  );
};
