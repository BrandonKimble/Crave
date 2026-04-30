import React from 'react';

import type { SearchForegroundEditingRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type UseSearchForegroundExitPresentationRuntimeArgs = Pick<
  SearchForegroundEditingRuntimeArgs,
  | 'shouldTreatSearchAsResults'
  | 'profilePresentationActive'
  | 'beginSuggestionCloseHold'
  | 'requestSearchPresentationIntent'
  | 'setIsSearchFocused'
  | 'setIsSuggestionPanelActive'
  | 'setShowSuggestions'
  | 'setSuggestions'
  | 'isSearchEditingRef'
>;

type SearchForegroundExitPresentationRuntime = {
  requestExitEditingPresentation: () => boolean;
  clearSuggestionsIfReady: (shouldDeferSuggestionClear: boolean) => void;
};

export const useSearchForegroundExitPresentationRuntime = ({
  shouldTreatSearchAsResults,
  profilePresentationActive,
  beginSuggestionCloseHold,
  requestSearchPresentationIntent,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setShowSuggestions,
  setSuggestions,
  isSearchEditingRef,
}: UseSearchForegroundExitPresentationRuntimeArgs): SearchForegroundExitPresentationRuntime => {
  const clearSuggestionsIfReady = React.useCallback(
    (shouldDeferSuggestionClear: boolean) => {
      if (shouldDeferSuggestionClear) {
        return;
      }
      setShowSuggestions(false);
      setSuggestions([]);
    },
    [setShowSuggestions, setSuggestions]
  );

  const requestExitEditingPresentation = React.useCallback(() => {
    setIsSearchFocused(false);
    isSearchEditingRef.current = false;
    const shouldDeferSuggestionClear = beginSuggestionCloseHold(
      shouldTreatSearchAsResults || profilePresentationActive ? 'submitting' : 'default'
    );
    setIsSuggestionPanelActive(false);
    requestSearchPresentationIntent({ kind: 'exit_editing' });
    return shouldDeferSuggestionClear;
  }, [
    beginSuggestionCloseHold,
    isSearchEditingRef,
    profilePresentationActive,
    requestSearchPresentationIntent,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    shouldTreatSearchAsResults,
  ]);

  return React.useMemo(
    () => ({
      requestExitEditingPresentation,
      clearSuggestionsIfReady,
    }),
    [clearSuggestionsIfReady, requestExitEditingPresentation]
  );
};
