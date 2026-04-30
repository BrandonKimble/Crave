import React from 'react';

import type {
  SearchForegroundEditingRuntimeArgs,
  SearchForegroundInteractionEditingHandlers,
} from './use-search-foreground-interaction-runtime-contract';
import { useSearchForegroundClearRuntime } from './use-search-foreground-clear-runtime';
import { useSearchForegroundExitEditingRuntime } from './use-search-foreground-exit-editing-runtime';
import { useSearchForegroundFocusRuntime } from './use-search-foreground-focus-runtime';

export const useSearchForegroundEditingHandlersRuntime = ({
  query,
  isSearchLoading,
  isSearchSessionActive,
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
  shouldTreatSearchAsResults,
  showPollsOverlay,
  profilePresentationActive,
  cancelAutocomplete,
  beginSuggestionCloseHold,
  requestSearchPresentationIntent,
  beginCloseSearch,
  restoreDockedPolls,
  searchSessionQueryRef,
  ...args
}: SearchForegroundEditingRuntimeArgs): SearchForegroundInteractionEditingHandlers => {
  const clearRuntime = useSearchForegroundClearRuntime({
    clearOwner: args.clearOwner,
    submittedQuery: args.submittedQuery,
    hasResults: args.hasResults,
    isSearchLoading,
    isLoadingMore: args.isLoadingMore,
    isSearchSessionActive,
    isSuggestionPanelActive,
    isSuggestionPanelVisible,
    profilePresentationActive,
    beginCloseSearch,
    ignoreNextSearchBlurRef: args.ignoreNextSearchBlurRef,
  });
  const focusRuntime = useSearchForegroundFocusRuntime({
    captureSearchSessionQuery: args.captureSearchSessionQuery,
    dismissTransientOverlays: args.dismissTransientOverlays,
    allowAutocompleteResults: args.allowAutocompleteResults,
    requestSearchPresentationIntent,
    setIsSearchFocused: args.setIsSearchFocused,
    setIsSuggestionPanelActive: args.setIsSuggestionPanelActive,
    setIsAutocompleteSuppressed: args.setIsAutocompleteSuppressed,
    isSearchEditingRef: args.isSearchEditingRef,
    allowSearchBlurExitRef: args.allowSearchBlurExitRef,
  });
  const exitEditingRuntime = useSearchForegroundExitEditingRuntime({
    query,
    isSearchLoading,
    isSearchSessionActive,
    isSuggestionPanelActive,
    shouldTreatSearchAsResults,
    showPollsOverlay,
    profilePresentationActive,
    cancelAutocomplete,
    beginSuggestionCloseHold,
    requestSearchPresentationIntent,
    restoreDockedPolls,
    suppressAutocompleteResults: args.suppressAutocompleteResults,
    setIsSearchFocused: args.setIsSearchFocused,
    setIsSuggestionPanelActive: args.setIsSuggestionPanelActive,
    setShowSuggestions: args.setShowSuggestions,
    setSuggestions: args.setSuggestions,
    setQuery: args.setQuery,
    setIsAutocompleteSuppressed: args.setIsAutocompleteSuppressed,
    searchSessionQueryRef,
    isSearchEditingRef: args.isSearchEditingRef,
    allowSearchBlurExitRef: args.allowSearchBlurExitRef,
    ignoreNextSearchBlurRef: args.ignoreNextSearchBlurRef,
    inputRef: args.inputRef,
  });

  return React.useMemo(
    () => ({
      handleClear: clearRuntime.handleClear,
      handleSearchFocus: focusRuntime.handleSearchFocus,
      handleSearchBlur: exitEditingRuntime.handleSearchBlur,
      handleSearchBack: exitEditingRuntime.handleSearchBack,
    }),
    [
      clearRuntime.handleClear,
      exitEditingRuntime.handleSearchBack,
      exitEditingRuntime.handleSearchBlur,
      focusRuntime.handleSearchFocus,
    ]
  );
};
