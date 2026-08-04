import React from 'react';

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
  bounds: MapBounds | null;
  userLocation: Coordinate | null;
};

/** Owned here now: this shape used to live only inside the deleted repacker module. */
type SearchAutocompleteRuntimeValue = {
  showCachedSuggestionsIfFresh: (rawQuery: string) => boolean;
  suppressAutocompleteResults: () => void;
  allowAutocompleteResults: () => void;
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
  bounds,
  userLocation,
}: UseSearchAutocompleteRuntimeArgs) => {
  const cacheScopeKey = buildAutocompleteScopeKey(bounds);
  const autocompleteCacheRuntime = useSearchAutocompleteCacheRuntime({
    cancelAutocomplete,
    setSuggestions,
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
    clearAutocompleteSuggestions: autocompleteCacheRuntime.clearAutocompleteSuggestions,
    lookupAutocompleteCache: autocompleteCacheRuntime.lookupAutocompleteCache,
    writeAutocompleteCache: autocompleteCacheRuntime.writeAutocompleteCache,
    bounds,
    userLocation,
  });

  return React.useMemo<SearchAutocompleteRuntimeValue>(
    () => ({
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
