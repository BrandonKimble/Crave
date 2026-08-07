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
};

const bucketCoordinate = (value: number | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : 'none';

/**
 * F6004: THE SCOPE KEY IS EVERY INPUT THE REQUEST CARRIES.
 *
 * The autocomplete request passes BOTH `bounds` and `userLocation` (see the
 * execution runtime), so both belong in the identity of anything cached from
 * its answer. This used to be built from `bounds` alone and applied as a
 * wholesale `cache.clear()` effect keyed on it — an invalidation that is only
 * correct AFTER commit, while the cache is read during RENDER by the lifecycle
 * memo. The key carries the scope now, so there is no moment at which the map
 * holds a reachable wrong-scope entry, and no effect to run.
 */
export const buildAutocompleteScopeKey = (
  bounds: MapBounds | null,
  userLocation: Coordinate | null
): string =>
  [
    bounds
      ? [
          bucketCoordinate(bounds.northEast.lat),
          bucketCoordinate(bounds.northEast.lng),
          bucketCoordinate(bounds.southWest.lat),
          bucketCoordinate(bounds.southWest.lng),
        ].join(':')
      : 'global',
    userLocation
      ? [bucketCoordinate(userLocation.lat), bucketCoordinate(userLocation.lng)].join(':')
      : 'nowhere',
  ].join('|');

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
  const cacheScopeKey = buildAutocompleteScopeKey(bounds, userLocation);
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
    }),
    [
      autocompleteCacheRuntime.showCachedSuggestionsIfFresh,
      autocompleteRequestRuntime.suppressAutocompleteResults,
    ]
  );
};
