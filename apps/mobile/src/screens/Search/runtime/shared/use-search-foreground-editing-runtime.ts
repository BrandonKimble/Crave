import React from 'react';

import type {
  SearchForegroundEditingRuntimeArgs,
  SearchForegroundInteractionEditingHandlers,
} from './use-search-foreground-interaction-runtime-contract';

export const useSearchForegroundEditingRuntime = ({
  clearOwner,
  query,
  submittedQuery,
  hasResults,
  isSearchLoading,
  isLoadingMore,
  isSearchSessionActive,
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
  shouldTreatSearchAsResults,
  showPollsOverlay,
  profilePresentationActive,
  captureSearchSessionQuery,
  dismissTransientOverlays,
  allowAutocompleteResults,
  suppressAutocompleteResults,
  cancelAutocomplete,
  beginSuggestionCloseHold,
  requestSearchPresentationIntent,
  beginCloseSearch,
  restoreDockedPolls,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setShowSuggestions,
  setSuggestions,
  setQuery,
  setIsAutocompleteSuppressed,
  searchSessionQueryRef,
  isSearchEditingRef,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
  inputRef,
}: SearchForegroundEditingRuntimeArgs): SearchForegroundInteractionEditingHandlers => {
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

  const handleSearchFocus = React.useCallback(() => {
    requestSearchPresentationIntent({ kind: 'focus_editing' });
    isSearchEditingRef.current = true;
    allowSearchBlurExitRef.current = false;
    captureSearchSessionQuery();
    dismissTransientOverlays();
    allowAutocompleteResults();
    setIsSearchFocused(true);
    setIsSuggestionPanelActive(true);
    setIsAutocompleteSuppressed(false);
  }, [
    allowAutocompleteResults,
    allowSearchBlurExitRef,
    captureSearchSessionQuery,
    dismissTransientOverlays,
    isSearchEditingRef,
    requestSearchPresentationIntent,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
  ]);

  const handleSearchBlur = React.useCallback(() => {
    if (!allowSearchBlurExitRef.current && isSuggestionPanelActive) {
      ignoreNextSearchBlurRef.current = true;
      requestAnimationFrame(() => {
        inputRef.current?.focus?.();
      });
      return;
    }
    allowSearchBlurExitRef.current = false;
    setIsSearchFocused(false);
    if (ignoreNextSearchBlurRef.current) {
      ignoreNextSearchBlurRef.current = false;
      return;
    }
    isSearchEditingRef.current = false;
    const shouldDeferSuggestionClear = beginSuggestionCloseHold(
      shouldTreatSearchAsResults || profilePresentationActive ? 'submitting' : 'default'
    );
    setIsSuggestionPanelActive(false);
    requestSearchPresentationIntent({ kind: 'exit_editing' });
    if (!shouldDeferSuggestionClear) {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  }, [
    allowSearchBlurExitRef,
    beginSuggestionCloseHold,
    ignoreNextSearchBlurRef,
    inputRef,
    isSuggestionPanelActive,
    isSearchEditingRef,
    profilePresentationActive,
    requestSearchPresentationIntent,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
    shouldTreatSearchAsResults,
  ]);

  const performImmediateSearchBack = React.useCallback(() => {
    setIsSearchFocused(false);
    isSearchEditingRef.current = false;
    const shouldDeferSuggestionClear = beginSuggestionCloseHold(
      shouldTreatSearchAsResults || profilePresentationActive ? 'submitting' : 'default'
    );
    setIsSuggestionPanelActive(false);
    requestSearchPresentationIntent({ kind: 'exit_editing' });
    if (shouldTreatSearchAsResults) {
      setIsAutocompleteSuppressed(true);
      const nextQuery = searchSessionQueryRef.current.trim();
      if (nextQuery && nextQuery !== query) {
        setQuery(nextQuery);
      }
      if (!shouldDeferSuggestionClear) {
        setShowSuggestions(false);
        setSuggestions([]);
      }
      return;
    }
    if (!shouldDeferSuggestionClear) {
      setShowSuggestions(false);
      setSuggestions([]);
    }
    if (!isSearchSessionActive) {
      cancelAutocomplete();
      setIsAutocompleteSuppressed(false);
      if (!showPollsOverlay && !isSearchLoading) {
        restoreDockedPolls();
      }
    }
  }, [
    beginSuggestionCloseHold,
    cancelAutocomplete,
    isSearchEditingRef,
    isSearchLoading,
    isSearchSessionActive,
    profilePresentationActive,
    query,
    requestSearchPresentationIntent,
    restoreDockedPolls,
    searchSessionQueryRef,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setQuery,
    setShowSuggestions,
    setSuggestions,
    shouldTreatSearchAsResults,
    showPollsOverlay,
  ]);

  const handleSearchBack = React.useCallback(() => {
    suppressAutocompleteResults();
    allowSearchBlurExitRef.current = false;
    ignoreNextSearchBlurRef.current = true;
    performImmediateSearchBack();
    if (inputRef.current?.isFocused?.()) {
      inputRef.current?.blur();
    }
  }, [
    allowSearchBlurExitRef,
    ignoreNextSearchBlurRef,
    inputRef,
    performImmediateSearchBack,
    suppressAutocompleteResults,
  ]);

  return {
    handleClear,
    handleSearchFocus,
    handleSearchBlur,
    handleSearchBack,
  };
};
