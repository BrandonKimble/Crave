import React from 'react';

import type {
  SearchForegroundEditingRuntimeArgs,
  SearchForegroundInteractionEditingHandlers,
} from './use-search-foreground-interaction-runtime-contract';
import { useSearchForegroundBackExitRuntime } from './use-search-foreground-back-exit-runtime';
import { useSearchForegroundBlurExitRuntime } from './use-search-foreground-blur-exit-runtime';
import { useSearchForegroundExitPresentationRuntime } from './use-search-foreground-exit-presentation-runtime';

type UseSearchForegroundExitEditingRuntimeArgs = Pick<
  SearchForegroundEditingRuntimeArgs,
  | 'query'
  | 'isSearchLoading'
  | 'isSearchSessionActive'
  | 'isSuggestionPanelActive'
  | 'shouldTreatSearchAsResults'
  | 'showPollsOverlay'
  | 'profilePresentationActive'
  | 'cancelAutocomplete'
  | 'beginSuggestionCloseHold'
  | 'requestSearchPresentationIntent'
  | 'restoreDockedPolls'
  | 'suppressAutocompleteResults'
  | 'setIsSearchFocused'
  | 'setIsSuggestionPanelActive'
  | 'setShowSuggestions'
  | 'setSuggestions'
  | 'setQuery'
  | 'setIsAutocompleteSuppressed'
  | 'searchSessionQueryRef'
  | 'isSearchEditingRef'
  | 'allowSearchBlurExitRef'
  | 'ignoreNextSearchBlurRef'
  | 'inputRef'
>;

type SearchForegroundExitEditingRuntime = Pick<
  SearchForegroundInteractionEditingHandlers,
  'handleSearchBlur' | 'handleSearchBack'
>;

export const useSearchForegroundExitEditingRuntime = ({
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
  suppressAutocompleteResults,
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
}: UseSearchForegroundExitEditingRuntimeArgs): SearchForegroundExitEditingRuntime => {
  const exitPresentationRuntime = useSearchForegroundExitPresentationRuntime({
    shouldTreatSearchAsResults,
    profilePresentationActive,
    beginSuggestionCloseHold,
    requestSearchPresentationIntent,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
    isSearchEditingRef,
  });
  const blurExitRuntime = useSearchForegroundBlurExitRuntime({
    isSuggestionPanelActive,
    allowSearchBlurExitRef,
    ignoreNextSearchBlurRef,
    inputRef,
    setIsSearchFocused,
    exitPresentationRuntime,
  });
  const backExitRuntime = useSearchForegroundBackExitRuntime({
    query,
    isSearchLoading,
    isSearchSessionActive,
    shouldTreatSearchAsResults,
    showPollsOverlay,
    cancelAutocomplete,
    restoreDockedPolls,
    suppressAutocompleteResults,
    setQuery,
    setIsAutocompleteSuppressed,
    searchSessionQueryRef,
    allowSearchBlurExitRef,
    ignoreNextSearchBlurRef,
    inputRef,
    exitPresentationRuntime,
  });

  return React.useMemo(
    () => ({
      handleSearchBlur: blurExitRuntime.handleSearchBlur,
      handleSearchBack: backExitRuntime.handleSearchBack,
    }),
    [backExitRuntime.handleSearchBack, blurExitRuntime.handleSearchBlur]
  );
};
