import React from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type { Coordinate, MapBounds } from '../../../../types';
import { useSearchAutocompleteRequestEffectRuntime } from './use-search-autocomplete-request-effect-runtime';
import { useSearchAutocompleteRequestStateRuntime } from './use-search-autocomplete-request-state-runtime';

type UseSearchAutocompleteRequestRuntimeArgs = {
  query: string;
  isSuggestionScreenActive: boolean;
  isSuggestionPanelVisible: boolean;
  isAutocompleteSuppressed: boolean;
  runAutocomplete: (
    value: string,
    options?: {
      debounceMs?: number;
      bounds?: MapBounds | null;
      userLocation?: Coordinate | null;
    }
  ) => Promise<AutocompleteMatch[]>;
  cancelAutocomplete: () => void;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  clearAutocompleteSuggestions: () => void;
  lookupAutocompleteCache: (
    rawQuery: string
  ) => { matches: AutocompleteMatch[]; isExactMatch: boolean } | null;
  writeAutocompleteCache: (rawQuery: string, matches: AutocompleteMatch[]) => void;
  bounds: MapBounds | null;
  userLocation: Coordinate | null;
};

type SearchAutocompleteRequestRuntime = {
  suppressAutocompleteResults: () => void;
};

export const useSearchAutocompleteRequestRuntime = ({
  query,
  isSuggestionScreenActive,
  isSuggestionPanelVisible,
  isAutocompleteSuppressed,
  runAutocomplete,
  cancelAutocomplete,
  setSuggestions,
  clearAutocompleteSuggestions,
  lookupAutocompleteCache,
  writeAutocompleteCache,
  bounds,
  userLocation,
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
    clearAutocompleteSuggestions,
    lookupAutocompleteCache,
    writeAutocompleteCache,
    requestStateRuntime,
    bounds,
    userLocation,
  });

  return React.useMemo(
    () => ({
      suppressAutocompleteResults: requestStateRuntime.suppressAutocompleteResults,
    }),
    [requestStateRuntime.suppressAutocompleteResults]
  );
};
