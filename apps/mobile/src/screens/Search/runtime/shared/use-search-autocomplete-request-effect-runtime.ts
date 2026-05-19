import React from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type { Coordinate, MapBounds } from '../../../../types';
import { useSearchAutocompleteRequestCleanupRuntime } from './use-search-autocomplete-request-cleanup-runtime';
import { useSearchAutocompleteRequestExecutionRuntime } from './use-search-autocomplete-request-execution-runtime';
import { useSearchAutocompleteRequestLifecycleRuntime } from './use-search-autocomplete-request-lifecycle-runtime';
import type { useSearchAutocompleteRequestStateRuntime } from './use-search-autocomplete-request-state-runtime';

export const useSearchAutocompleteRequestEffectRuntime = ({
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
  bounds,
  userLocation,
}: {
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
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  clearAutocompleteSuggestions: () => void;
  lookupAutocompleteCache: (
    rawQuery: string
  ) => { matches: AutocompleteMatch[]; isExactMatch: boolean } | null;
  writeAutocompleteCache: (rawQuery: string, matches: AutocompleteMatch[]) => void;
  requestStateRuntime: ReturnType<typeof useSearchAutocompleteRequestStateRuntime>;
  bounds: MapBounds | null;
  userLocation: Coordinate | null;
}): void => {
  const requestLifecycle = useSearchAutocompleteRequestLifecycleRuntime({
    query,
    isSuggestionScreenActive,
    isSuggestionPanelVisible,
    isAutocompleteSuppressed,
    cancelAutocomplete,
    clearAutocompleteSuggestions,
    lookupAutocompleteCache,
    requestStateRuntime,
    setShowSuggestions,
    setSuggestions,
  });

  useSearchAutocompleteRequestExecutionRuntime({
    trimmed: requestLifecycle.trimmed,
    shouldRequest: requestLifecycle.shouldRequest,
    runAutocomplete,
    cancelAutocomplete,
    setSuggestions,
    setShowSuggestions,
    clearAutocompleteSuggestions,
    writeAutocompleteCache,
    requestStateRuntime,
    bounds,
    userLocation,
  });

  useSearchAutocompleteRequestCleanupRuntime({
    cancelAutocomplete,
    requestStateRuntime,
  });
};
