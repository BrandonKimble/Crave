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
  | 'profilePresentationActive'
  | 'cancelAutocomplete'
  | 'beginSuggestionCloseHold'
  | 'requestSearchPresentationIntent'
  | 'restoreDockedScene'
  | 'suppressAutocompleteResults'
  | 'setIsSearchFocused'
  | 'setIsSuggestionPanelActive'
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
  profilePresentationActive,
  cancelAutocomplete,
  beginSuggestionCloseHold,
  requestSearchPresentationIntent,
  restoreDockedScene,
  suppressAutocompleteResults,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
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
    cancelAutocomplete,
    restoreDockedScene,
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
