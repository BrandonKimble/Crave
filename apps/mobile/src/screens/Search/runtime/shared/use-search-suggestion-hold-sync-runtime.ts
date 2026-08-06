import React from 'react';

import type { SearchSuggestionHoldSyncRuntimeArgs } from './search-suggestion-surface-runtime-contract';

export const useSearchSuggestionHoldSyncRuntime = ({
  query,
  isSuggestionPanelActive,
  setSuggestions,
  setBeginSuggestionCloseHold,
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
    const didReset = resetSubmitTransitionHoldIfQueryChanged(query);
    if (!didReset) {
      return;
    }
    setSuggestions([]);
  }, [isSuggestionPanelActive, query, resetSubmitTransitionHoldIfQueryChanged, setSuggestions]);

  React.useEffect(() => {
    if (shouldDriveSuggestionLayout) {
      return;
    }
    resetSubmitTransitionHold();
    setSuggestions([]);
  }, [resetSubmitTransitionHold, setSuggestions, shouldDriveSuggestionLayout]);
};
