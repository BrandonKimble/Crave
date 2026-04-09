import React from 'react';
import { Keyboard } from 'react-native';

import type { UseResultsPresentationOwnerActionRuntimeArgs } from './results-presentation-owner-action-runtime-contract';

type UseResultsPresentationOwnerCloseSearchCleanupRuntimeArgs<Suggestion> = Pick<
  UseResultsPresentationOwnerActionRuntimeArgs<Suggestion>,
  | 'cancelActiveSearchRequest'
  | 'cancelAutocomplete'
  | 'handleCancelPendingMutationWork'
  | 'resetSubmitTransitionHold'
  | 'setIsSearchFocused'
  | 'setIsSuggestionPanelActive'
  | 'setIsAutocompleteSuppressed'
  | 'setShowSuggestions'
  | 'setQuery'
  | 'setError'
  | 'setSuggestions'
  | 'inputRef'
  | 'resultsRuntimeOwner'
> & {
  setPendingCloseIntentId: (intentId: string | null) => void;
  matchesPendingCloseIntentId: (intentId: string) => boolean;
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
  resultsRuntimeOwner,
  setPendingCloseIntentId,
  matchesPendingCloseIntentId,
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
      scheduleCloseSearchCleanup,
      cancelCloseSearchCleanup,
    }),
    [cancelCloseSearchCleanup, scheduleCloseSearchCleanup]
  );
};
