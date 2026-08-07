import React from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type { Coordinate, MapBounds } from '../../../../types';
import type { RunAutocomplete } from './search-autocomplete-request-runtime';
import { useSearchAutocompleteCacheRuntime } from './use-search-autocomplete-cache-runtime';
import { useSearchAutocompleteRequestExecutionRuntime } from './use-search-autocomplete-request-execution-runtime';
import { useSearchAutocompleteRequestLifecycleRuntime } from './use-search-autocomplete-request-lifecycle-runtime';
import { useSearchAutocompleteRequestStateRuntime } from './use-search-autocomplete-request-state-runtime';

type UseSearchAutocompleteRuntimeArgs = {
  query: string;
  isSuggestionScreenActive: boolean;
  isSuggestionPanelVisible: boolean;
  isAutocompleteSuppressed: boolean;
  runAutocomplete: RunAutocomplete;
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

/**
 * F6005: THE WHOLE AUTOCOMPLETE RUNTIME, WITHOUT THE TOWER.
 *
 * This was the top of a five-storey composition chain
 * (`...Runtime` -> `...RequestRuntime` -> `...RequestEffectRuntime` ->
 * {Lifecycle, Execution, Cleanup}) in which two storeys transformed NOTHING.
 * `...RequestEffectRuntime` was 76 lines, 38 of them a re-declaration of the
 * arg bag and the rest three hook calls forwarding their arguments verbatim,
 * returning void. `...RequestRuntime` returned a memo whose members were read
 * straight off an object that was already a memo, and this file repacked the
 * same references again. Calling a hook is not a boundary; SUBSCRIBING is
 * (D93/F5300), and none of those layers subscribed — React re-ran them on every
 * parent render exactly as if inlined. The win is truth-in-one-place, not
 * re-render volume, which is unchanged.
 *
 * `use-search-autocomplete-request-cleanup-runtime.ts` went with them: its one
 * unmount effect bumped the sequence and cancelled — the identical pair the
 * execution effect's OWN cleanup already performs when a request is in flight,
 * and a no-op when one is not (the execution effect early-returns before
 * registering anything, so there is nothing to invalidate and the debouncer is
 * idle). Every execution of that module was a duplicate or a no-op.
 */
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
}: UseSearchAutocompleteRuntimeArgs): SearchAutocompleteRuntimeValue => {
  const cacheScopeKey = buildAutocompleteScopeKey(bounds, userLocation);
  const autocompleteCacheRuntime = useSearchAutocompleteCacheRuntime({
    cancelAutocomplete,
    setSuggestions,
    cacheScopeKey,
  });

  const requestStateRuntime = useSearchAutocompleteRequestStateRuntime({
    query,
    isSuggestionScreenActive,
    isAutocompleteSuppressed,
    cancelAutocomplete,
  });

  const requestLifecycle = useSearchAutocompleteRequestLifecycleRuntime({
    query,
    isSuggestionScreenActive,
    isSuggestionPanelVisible,
    isAutocompleteSuppressed,
    cancelAutocomplete,
    clearAutocompleteSuggestions: autocompleteCacheRuntime.clearAutocompleteSuggestions,
    lookupAutocompleteCache: autocompleteCacheRuntime.lookupAutocompleteCache,
    setSuggestions,
    requestStateRuntime,
  });

  useSearchAutocompleteRequestExecutionRuntime({
    trimmed: requestLifecycle.trimmed,
    shouldRequest: requestLifecycle.shouldRequest,
    runAutocomplete,
    cancelAutocomplete,
    setSuggestions,
    writeAutocompleteCache: autocompleteCacheRuntime.writeAutocompleteCache,
    requestStateRuntime,
    bounds,
    userLocation,
  });

  return React.useMemo<SearchAutocompleteRuntimeValue>(
    () => ({
      showCachedSuggestionsIfFresh: autocompleteCacheRuntime.showCachedSuggestionsIfFresh,
      suppressAutocompleteResults: requestStateRuntime.suppressAutocompleteResults,
    }),
    [
      autocompleteCacheRuntime.showCachedSuggestionsIfFresh,
      requestStateRuntime.suppressAutocompleteResults,
    ]
  );
};
