import React from 'react';
import type { TextInput } from 'react-native';

import { AUTOCOMPLETE_MIN_CHARS } from '../../constants/search';
import type { SearchBackdropTarget } from './results-presentation-shell-contract';

type UseSearchForegroundInputRuntimeArgs = {
  query: string;
  submittedQuery: string;
  resolvedSubmittedQuery: string;
  searchMode: 'natural' | 'shortcut' | null;
  backdropTarget: SearchBackdropTarget;
  isSearchFocused: boolean;
  isSearchSessionActive: boolean;
  isSuggestionPanelActive: boolean;
  requestSearchPresentationIntent: (intent: { kind: 'focus_editing' | 'exit_editing' }) => void;
  dismissTransientOverlays: () => void;
  allowAutocompleteResults: () => void;
  showCachedSuggestionsIfFresh: (rawQuery: string) => boolean;
  cancelAutocomplete: () => void;
  inputRef: React.RefObject<TextInput | null>;
  searchSessionQueryRef: React.MutableRefObject<string>;
  isSearchEditingRef: React.MutableRefObject<boolean>;
  allowSearchBlurExitRef: React.MutableRefObject<boolean>;
  setIsAutocompleteSuppressed: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
};

export const useSearchForegroundInputRuntime = ({
  query,
  submittedQuery,
  resolvedSubmittedQuery,
  searchMode,
  backdropTarget,
  isSearchFocused,
  isSearchSessionActive,
  isSuggestionPanelActive,
  requestSearchPresentationIntent,
  dismissTransientOverlays,
  allowAutocompleteResults,
  showCachedSuggestionsIfFresh,
  cancelAutocomplete,
  inputRef,
  searchSessionQueryRef,
  isSearchEditingRef,
  allowSearchBlurExitRef,
  setIsAutocompleteSuppressed,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setQuery,
}: UseSearchForegroundInputRuntimeArgs) => {
  const captureSearchSessionQuery = React.useCallback(() => {
    if (!isSearchSessionActive || isSuggestionPanelActive) {
      return;
    }
    searchSessionQueryRef.current = submittedQuery || query;
  }, [
    isSearchSessionActive,
    isSuggestionPanelActive,
    query,
    searchSessionQueryRef,
    submittedQuery,
  ]);

  React.useEffect(() => {
    if (searchMode !== 'shortcut') {
      return;
    }
    if (backdropTarget === 'default') {
      return;
    }
    if (isSearchFocused || isSuggestionPanelActive) {
      return;
    }
    const nextQuery = resolvedSubmittedQuery.trim();
    if (!nextQuery || nextQuery === query) {
      return;
    }
    setQuery(nextQuery);
  }, [
    backdropTarget,
    isSearchFocused,
    isSuggestionPanelActive,
    query,
    resolvedSubmittedQuery,
    searchMode,
    setQuery,
  ]);

  const focusSearchInput = React.useCallback(() => {
    requestSearchPresentationIntent({ kind: 'focus_editing' });
    isSearchEditingRef.current = true;
    allowSearchBlurExitRef.current = false;
    captureSearchSessionQuery();
    dismissTransientOverlays();
    allowAutocompleteResults();
    setIsAutocompleteSuppressed(false);
    setIsSearchFocused(true);
    setIsSuggestionPanelActive(true);

    const submittedQueryTrimmed = resolvedSubmittedQuery.trim();
    const shouldSeedEditingFromSubmittedQuery =
      backdropTarget === 'results' &&
      isSearchSessionActive &&
      submittedQueryTrimmed.length > 0 &&
      query.trim().length === 0;
    const nextQueryValue = shouldSeedEditingFromSubmittedQuery
      ? submittedQueryTrimmed
      : backdropTarget === 'default'
      ? ''
      : query;
    if (nextQueryValue !== query) {
      setQuery(nextQueryValue);
    }

    const trimmed = nextQueryValue.trim();
    if (trimmed.length >= AUTOCOMPLETE_MIN_CHARS) {
      const usedCache = showCachedSuggestionsIfFresh(trimmed);
      if (!usedCache) {
        cancelAutocomplete();
      }
    }
    inputRef.current?.focus();
  }, [
    allowAutocompleteResults,
    allowSearchBlurExitRef,
    backdropTarget,
    cancelAutocomplete,
    captureSearchSessionQuery,
    dismissTransientOverlays,
    inputRef,
    isSearchEditingRef,
    isSearchSessionActive,
    query,
    requestSearchPresentationIntent,
    resolvedSubmittedQuery,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setQuery,
    showCachedSuggestionsIfFresh,
  ]);

  const handleSearchPressIn = React.useCallback(() => {
    requestSearchPresentationIntent({ kind: 'focus_editing' });
    isSearchEditingRef.current = true;
    allowSearchBlurExitRef.current = false;
    captureSearchSessionQuery();
    dismissTransientOverlays();
    allowAutocompleteResults();
    setIsAutocompleteSuppressed(false);
    setIsSearchFocused(true);
    setIsSuggestionPanelActive(true);
    if (backdropTarget === 'default' && query.length > 0) {
      setQuery('');
    }
  }, [
    allowAutocompleteResults,
    allowSearchBlurExitRef,
    backdropTarget,
    captureSearchSessionQuery,
    dismissTransientOverlays,
    isSearchEditingRef,
    query.length,
    requestSearchPresentationIntent,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setQuery,
  ]);

  const handleQueryChange = React.useCallback(
    (value: string) => {
      setIsAutocompleteSuppressed(false);
      setQuery(value);
    },
    [setIsAutocompleteSuppressed, setQuery]
  );

  return {
    captureSearchSessionQuery,
    focusSearchInput,
    handleSearchPressIn,
    handleQueryChange,
  };
};
