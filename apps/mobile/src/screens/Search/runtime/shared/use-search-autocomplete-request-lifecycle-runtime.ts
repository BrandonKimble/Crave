import React from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import { AUTOCOMPLETE_MIN_CHARS } from '../../constants/search';
import { writeAutocompleteSuggestions } from './search-autocomplete-request-runtime';
import type { useSearchAutocompleteRequestStateRuntime } from './use-search-autocomplete-request-state-runtime';

export const useSearchAutocompleteRequestLifecycleRuntime = ({
  query,
  isSuggestionScreenActive,
  isSuggestionPanelVisible,
  isAutocompleteSuppressed,
  cancelAutocomplete,
  clearAutocompleteSuggestions,
  lookupAutocompleteCache,
  setSuggestions,
  requestStateRuntime,
}: {
  query: string;
  isSuggestionScreenActive: boolean;
  isSuggestionPanelVisible: boolean;
  isAutocompleteSuppressed: boolean;
  cancelAutocomplete: () => void;
  clearAutocompleteSuggestions: () => void;
  lookupAutocompleteCache: (
    rawQuery: string
  ) => { matches: AutocompleteMatch[]; isExactMatch: boolean } | null;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  requestStateRuntime: ReturnType<typeof useSearchAutocompleteRequestStateRuntime>;
}) => {
  const lifecycle = React.useMemo(() => {
    const trimmed = query.trim();
    const shouldRun = isSuggestionScreenActive && !isAutocompleteSuppressed;

    if (!shouldRun) {
      return {
        cachedMatches: null,
        clearSuggestions: !isSuggestionPanelVisible,
        shouldCancel: true,
        shouldRequest: false,
        trimmed,
      };
    }

    if (trimmed.length < AUTOCOMPLETE_MIN_CHARS) {
      return {
        cachedMatches: null,
        clearSuggestions: true,
        shouldCancel: true,
        shouldRequest: false,
        trimmed,
      };
    }

    const cached = lookupAutocompleteCache(trimmed);
    if (cached) {
      return {
        cachedMatches: cached.matches,
        clearSuggestions: false,
        shouldCancel: cached.isExactMatch,
        shouldRequest: !cached.isExactMatch,
        trimmed,
      };
    }

    return {
      cachedMatches: null,
      clearSuggestions: false,
      shouldCancel: false,
      shouldRequest: true,
      trimmed,
    };
  }, [
    isAutocompleteSuppressed,
    isSuggestionPanelVisible,
    isSuggestionScreenActive,
    lookupAutocompleteCache,
    query,
  ]);

  React.useEffect(() => {
    if (lifecycle.shouldCancel) {
      requestStateRuntime.autocompleteRequestSequenceRef.current += 1;
      cancelAutocomplete();
    }
    if (lifecycle.clearSuggestions) {
      clearAutocompleteSuggestions();
      return;
    }
    if (lifecycle.cachedMatches != null) {
      writeAutocompleteSuggestions(setSuggestions, lifecycle.cachedMatches);
    }
  }, [
    cancelAutocomplete,
    clearAutocompleteSuggestions,
    lifecycle,
    requestStateRuntime,
    setSuggestions,
  ]);

  return {
    shouldRequest: lifecycle.shouldRequest,
    trimmed: lifecycle.trimmed,
  };
};
