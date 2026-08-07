import React from 'react';

import type {
  SearchForegroundEditingRuntimeArgs,
  SearchForegroundInteractionEditingHandlers,
} from './search-foreground-interaction-runtime-contract';
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
  profilePresentationActive,
  cancelAutocomplete,
  beginSuggestionCloseHold,
  requestSearchPresentationIntent,
  beginCloseSearch,
  restoreDockedScene,
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
    profilePresentationActive,
    cancelAutocomplete,
    beginSuggestionCloseHold,
    requestSearchPresentationIntent,
    restoreDockedScene,
    suppressAutocompleteResults: args.suppressAutocompleteResults,
    setIsSearchFocused: args.setIsSearchFocused,
    setIsSuggestionPanelActive: args.setIsSuggestionPanelActive,
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
