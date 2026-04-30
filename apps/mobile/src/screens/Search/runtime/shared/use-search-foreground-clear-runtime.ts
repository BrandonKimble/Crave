import React from 'react';

import type {
  SearchForegroundEditingRuntimeArgs,
  SearchForegroundInteractionEditingHandlers,
} from './use-search-foreground-interaction-runtime-contract';

type UseSearchForegroundClearRuntimeArgs = Pick<
  SearchForegroundEditingRuntimeArgs,
  | 'clearOwner'
  | 'submittedQuery'
  | 'hasResults'
  | 'isSearchLoading'
  | 'isLoadingMore'
  | 'isSearchSessionActive'
  | 'isSuggestionPanelActive'
  | 'isSuggestionPanelVisible'
  | 'profilePresentationActive'
  | 'beginCloseSearch'
  | 'ignoreNextSearchBlurRef'
>;

type SearchForegroundClearRuntime = Pick<
  SearchForegroundInteractionEditingHandlers,
  'handleClear'
>;

export const useSearchForegroundClearRuntime = ({
  clearOwner,
  submittedQuery,
  hasResults,
  isSearchLoading,
  isLoadingMore,
  isSearchSessionActive,
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
  profilePresentationActive,
  beginCloseSearch,
  ignoreNextSearchBlurRef,
}: UseSearchForegroundClearRuntimeArgs): SearchForegroundClearRuntime => {
  const { clearTypedQuery, clearSearchState } = clearOwner;

  const handleClear = React.useCallback(() => {
    const shouldCloseSuggestions = isSuggestionPanelActive || isSuggestionPanelVisible;
    const hasSearchToClose = isSearchSessionActive || hasResults || submittedQuery.length > 0;
    if (isSuggestionPanelActive) {
      clearTypedQuery();
      return;
    }
    if (!isSearchSessionActive && !shouldCloseSuggestions && !profilePresentationActive) {
      clearTypedQuery();
      return;
    }
    if (hasSearchToClose) {
      beginCloseSearch();
      return;
    }
    ignoreNextSearchBlurRef.current = true;
    clearSearchState({
      shouldRefocusInput: !isSearchSessionActive && !isSearchLoading && !isLoadingMore,
      skipProfileDismissWait: true,
    });
  }, [
    beginCloseSearch,
    clearSearchState,
    clearTypedQuery,
    hasResults,
    ignoreNextSearchBlurRef,
    isLoadingMore,
    isSearchLoading,
    isSearchSessionActive,
    isSuggestionPanelActive,
    isSuggestionPanelVisible,
    profilePresentationActive,
    submittedQuery,
  ]);

  return React.useMemo(
    () => ({
      handleClear,
    }),
    [handleClear]
  );
};
