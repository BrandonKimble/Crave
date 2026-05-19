import React from 'react';

import { createSearchAutocompleteRuntimeValue } from '../controller/search-autocomplete-runtime';
import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type { Coordinate, MapBounds } from '../../../../types';
import { useSearchAutocompleteCacheRuntime } from './use-search-autocomplete-cache-runtime';
import { useSearchAutocompleteRequestRuntime } from './use-search-autocomplete-request-runtime';

type UseSearchAutocompleteRuntimeArgs = {
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
  bounds: MapBounds | null;
  userLocation: Coordinate | null;
};

const bucketCoordinate = (value: number | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : 'none';

const buildAutocompleteScopeKey = (bounds: MapBounds | null): string =>
  bounds
    ? [
        bucketCoordinate(bounds.northEast.lat),
        bucketCoordinate(bounds.northEast.lng),
        bucketCoordinate(bounds.southWest.lat),
        bucketCoordinate(bounds.southWest.lng),
      ].join(':')
    : 'global';

export const useSearchAutocompleteRuntime = ({
  query,
  isSuggestionScreenActive,
  isSuggestionPanelVisible,
  isAutocompleteSuppressed,
  runAutocomplete,
  cancelAutocomplete,
  setSuggestions,
  setShowSuggestions,
  bounds,
  userLocation,
}: UseSearchAutocompleteRuntimeArgs) => {
  const cacheScopeKey = buildAutocompleteScopeKey(bounds);
  const autocompleteCacheRuntime = useSearchAutocompleteCacheRuntime({
    cancelAutocomplete,
    setSuggestions,
    setShowSuggestions,
    cacheScopeKey,
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
    clearAutocompleteSuggestions: autocompleteCacheRuntime.clearAutocompleteSuggestions,
    lookupAutocompleteCache: autocompleteCacheRuntime.lookupAutocompleteCache,
    writeAutocompleteCache: autocompleteCacheRuntime.writeAutocompleteCache,
    bounds,
    userLocation,
  });

  return React.useMemo(
    () =>
      createSearchAutocompleteRuntimeValue({
        showCachedSuggestionsIfFresh: autocompleteCacheRuntime.showCachedSuggestionsIfFresh,
        suppressAutocompleteResults: autocompleteRequestRuntime.suppressAutocompleteResults,
        allowAutocompleteResults: autocompleteRequestRuntime.allowAutocompleteResults,
      }),
    [
      autocompleteCacheRuntime.showCachedSuggestionsIfFresh,
      autocompleteRequestRuntime.allowAutocompleteResults,
      autocompleteRequestRuntime.suppressAutocompleteResults,
    ]
  );
};
