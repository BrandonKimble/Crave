import React from 'react';

import type { SearchSuggestionHoldSyncRuntimeArgs } from './use-search-suggestion-surface-runtime-contract';

export const useSearchSuggestionHoldSyncRuntime = ({
  query,
  isSuggestionPanelActive,
  setSuggestions,
  setShowSuggestions,
  setBeginSuggestionCloseHold,
  setSearchTransitionVariant,
  shouldDriveSuggestionLayout,
  resetSubmitTransitionHold,
  resetSubmitTransitionHoldIfQueryChanged,
  beginSuggestionCloseHold,
}: SearchSuggestionHoldSyncRuntimeArgs): void => {
  React.useEffect(() => {
    setBeginSuggestionCloseHold(beginSuggestionCloseHold);
  }, [beginSuggestionCloseHold, setBeginSuggestionCloseHold]);

  React.useEffect(() => {
    if (!isSuggestionPanelActive) {
      return;
    }
    setSearchTransitionVariant('default');
    const didReset = resetSubmitTransitionHoldIfQueryChanged(query);
    if (!didReset) {
      return;
    }
    setSuggestions([]);
    setShowSuggestions(false);
  }, [
    isSuggestionPanelActive,
    query,
    resetSubmitTransitionHoldIfQueryChanged,
    setSearchTransitionVariant,
    setShowSuggestions,
    setSuggestions,
  ]);

  React.useEffect(() => {
    if (shouldDriveSuggestionLayout) {
      return;
    }
    resetSubmitTransitionHold();
    setSuggestions([]);
    setShowSuggestions(false);
  }, [resetSubmitTransitionHold, setShowSuggestions, setSuggestions, shouldDriveSuggestionLayout]);
};
