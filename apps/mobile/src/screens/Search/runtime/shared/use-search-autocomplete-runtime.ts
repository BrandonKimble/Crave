import React from 'react';

import { createSearchAutocompleteRuntimeValue } from '../controller/search-autocomplete-runtime';
import type { AutocompleteMatch } from '../../../../services/autocomplete';
import { useSearchAutocompleteCacheRuntime } from './use-search-autocomplete-cache-runtime';
import { useSearchAutocompleteRequestRuntime } from './use-search-autocomplete-request-runtime';

type UseSearchAutocompleteRuntimeArgs = {
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
};

export const useSearchAutocompleteRuntime = ({
  query,
  isSuggestionScreenActive,
  isSuggestionPanelVisible,
  isAutocompleteSuppressed,
  runAutocomplete,
  cancelAutocomplete,
  setSuggestions,
  setShowSuggestions,
}: UseSearchAutocompleteRuntimeArgs) => {
  const autocompleteCacheRuntime = useSearchAutocompleteCacheRuntime({
    cancelAutocomplete,
    setSuggestions,
    setShowSuggestions,
  });

  const autocompleteRequestRuntime = useSearchAutocompleteRequestRuntime({
    query,
    isSuggestionScreenActive,
    isSuggestionPanelVisible,
    isAutocompleteSuppressed,
    runAutocomplete,
    cancelAutocomplete,
    setSuggestions,
    setShowSuggestions,
    clearAutocompleteSuggestions:
      autocompleteCacheRuntime.clearAutocompleteSuggestions,
    lookupAutocompleteCache: autocompleteCacheRuntime.lookupAutocompleteCache,
    writeAutocompleteCache: autocompleteCacheRuntime.writeAutocompleteCache,
  });

  return React.useMemo(
    () =>
      createSearchAutocompleteRuntimeValue({
        showCachedSuggestionsIfFresh:
          autocompleteCacheRuntime.showCachedSuggestionsIfFresh,
        suppressAutocompleteResults:
          autocompleteRequestRuntime.suppressAutocompleteResults,
        allowAutocompleteResults: autocompleteRequestRuntime.allowAutocompleteResults,
      }),
    [
      autocompleteCacheRuntime.showCachedSuggestionsIfFresh,
      autocompleteRequestRuntime.allowAutocompleteResults,
      autocompleteRequestRuntime.suppressAutocompleteResults,
    ]
  );
};
