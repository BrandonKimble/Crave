import React from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import { useSearchAutocompleteRequestEffectRuntime } from './use-search-autocomplete-request-effect-runtime';
import { useSearchAutocompleteRequestStateRuntime } from './use-search-autocomplete-request-state-runtime';

type UseSearchAutocompleteRequestRuntimeArgs = {
  query: string;
  isSuggestionScreenActive: boolean;
  isSuggestionPanelVisible: boolean;
  isAutocompleteSuppressed: boolean;
  runAutocomplete: (
    value: string,
    options?: { debounceMs?: number }
  ) => Promise<AutocompleteMatch[]>;
  cancelAutocomplete: () => void;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  clearAutocompleteSuggestions: () => void;
  lookupAutocompleteCache: (
    rawQuery: string
  ) => { matches: AutocompleteMatch[]; isExactMatch: boolean } | null;
  writeAutocompleteCache: (rawQuery: string, matches: AutocompleteMatch[]) => void;
};

type SearchAutocompleteRequestRuntime = {
  suppressAutocompleteResults: () => void;
  allowAutocompleteResults: () => void;
};

export const useSearchAutocompleteRequestRuntime = ({
  query,
  isSuggestionScreenActive,
  isSuggestionPanelVisible,
  isAutocompleteSuppressed,
  runAutocomplete,
  cancelAutocomplete,
  setSuggestions,
  setShowSuggestions,
  clearAutocompleteSuggestions,
  lookupAutocompleteCache,
  writeAutocompleteCache,
}: UseSearchAutocompleteRequestRuntimeArgs): SearchAutocompleteRequestRuntime => {
  const requestStateRuntime = useSearchAutocompleteRequestStateRuntime({
    query,
    isSuggestionScreenActive,
    isAutocompleteSuppressed,
    cancelAutocomplete,
  });

  useSearchAutocompleteRequestEffectRuntime({
    query,
    isSuggestionScreenActive,
    isSuggestionPanelVisible,
    isAutocompleteSuppressed,
    runAutocomplete,
    cancelAutocomplete,
    setSuggestions,
    setShowSuggestions,
    clearAutocompleteSuggestions,
    lookupAutocompleteCache,
    writeAutocompleteCache,
    requestStateRuntime,
  });

  return React.useMemo(
    () => ({
      suppressAutocompleteResults: requestStateRuntime.suppressAutocompleteResults,
      allowAutocompleteResults: requestStateRuntime.allowAutocompleteResults,
    }),
    [
      requestStateRuntime.allowAutocompleteResults,
      requestStateRuntime.suppressAutocompleteResults,
    ]
  );
};
