import React from 'react';

import type {
  SearchForegroundEditingRuntimeArgs,
  SearchForegroundInteractionEditingHandlers,
} from './use-search-foreground-interaction-runtime-contract';
import type { useSearchForegroundExitPresentationRuntime } from './use-search-foreground-exit-presentation-runtime';

type UseSearchForegroundBackExitRuntimeArgs = Pick<
  SearchForegroundEditingRuntimeArgs,
  | 'query'
  | 'isSearchLoading'
  | 'isSearchSessionActive'
  | 'shouldTreatSearchAsResults'
  | 'showPollsOverlay'
  | 'cancelAutocomplete'
  | 'restoreDockedPolls'
  | 'suppressAutocompleteResults'
  | 'setQuery'
  | 'setIsAutocompleteSuppressed'
  | 'searchSessionQueryRef'
  | 'allowSearchBlurExitRef'
  | 'ignoreNextSearchBlurRef'
  | 'inputRef'
> & {
  exitPresentationRuntime: ReturnType<typeof useSearchForegroundExitPresentationRuntime>;
};

type SearchForegroundBackExitRuntime = Pick<
  SearchForegroundInteractionEditingHandlers,
  'handleSearchBack'
>;

export const useSearchForegroundBackExitRuntime = ({
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
}: UseSearchForegroundBackExitRuntimeArgs): SearchForegroundBackExitRuntime => {
  const performImmediateSearchBack = React.useCallback(() => {
    const shouldDeferSuggestionClear =
      exitPresentationRuntime.requestExitEditingPresentation();
    if (shouldTreatSearchAsResults) {
      setIsAutocompleteSuppressed(true);
      const nextQuery = searchSessionQueryRef.current.trim();
      if (nextQuery && nextQuery !== query) {
        setQuery(nextQuery);
      }
      exitPresentationRuntime.clearSuggestionsIfReady(shouldDeferSuggestionClear);
      return;
    }
    exitPresentationRuntime.clearSuggestionsIfReady(shouldDeferSuggestionClear);
    if (!isSearchSessionActive) {
      cancelAutocomplete();
      setIsAutocompleteSuppressed(false);
      if (!showPollsOverlay && !isSearchLoading) {
        restoreDockedPolls();
      }
    }
  }, [
    cancelAutocomplete,
    exitPresentationRuntime,
    isSearchLoading,
    isSearchSessionActive,
    query,
    restoreDockedPolls,
    searchSessionQueryRef,
    setIsAutocompleteSuppressed,
    setQuery,
    shouldTreatSearchAsResults,
    showPollsOverlay,
  ]);

  const handleSearchBack = React.useCallback(() => {
    suppressAutocompleteResults();
    allowSearchBlurExitRef.current = false;
    ignoreNextSearchBlurRef.current = true;
    performImmediateSearchBack();
    if (inputRef.current?.isFocused?.()) {
      requestAnimationFrame(() => {
        inputRef.current?.blur();
      });
    }
  }, [
    allowSearchBlurExitRef,
    ignoreNextSearchBlurRef,
    inputRef,
    performImmediateSearchBack,
    suppressAutocompleteResults,
  ]);

  return React.useMemo(
    () => ({
      handleSearchBack,
    }),
    [handleSearchBack]
  );
};
