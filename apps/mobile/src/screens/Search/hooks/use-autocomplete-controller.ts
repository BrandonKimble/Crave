import React from 'react';

import type { AutocompleteMatch } from '../../../services/autocomplete';
import type { Coordinate, MapBounds } from '../../../types';

type UseAutocompleteControllerArgs = {
  query: string;
  isSuggestionScreenActive: boolean;
  isSuggestionScreenVisible: boolean;
  isAutocompleteSuppressed: boolean;
  runAutocomplete: (
    query: string,
    options?: {
      debounceMs?: number;
      bounds?: MapBounds | null;
      userLocation?: Coordinate | null;
    }
  ) => Promise<AutocompleteMatch[]>;
  cancelAutocomplete: () => void;
  latestBoundsRef: React.RefObject<MapBounds | null>;
  userLocationRef: React.RefObject<Coordinate | null>;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  autocompleteMinChars: number;
  autocompleteCacheTtlMs: number;
};

type CachedAutocompleteEntry = {
  query: string;
  matches: AutocompleteMatch[];
  updatedAtMs: number;
};

type UseAutocompleteControllerResult = {
  suppressAutocompleteResults: () => void;
  allowAutocompleteResults: () => void;
  showCachedSuggestionsIfFresh: (query: string) => boolean;
};

const MAX_AUTOCOMPLETE_CACHE_ENTRIES = 64;

const normalizeAutocompleteQuery = (value: string): string => value.trim().toLowerCase();

const writeAutocompleteSuggestions = (
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>,
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>,
  matches: AutocompleteMatch[]
) => {
  setSuggestions(matches);
  setShowSuggestions(matches.length > 0);
};

export const useAutocompleteController = ({
  query,
  isSuggestionScreenActive,
  isSuggestionScreenVisible,
  isAutocompleteSuppressed,
  runAutocomplete,
  cancelAutocomplete,
  latestBoundsRef,
  userLocationRef,
  setSuggestions,
  setShowSuggestions,
  autocompleteMinChars,
  autocompleteCacheTtlMs,
}: UseAutocompleteControllerArgs): UseAutocompleteControllerResult => {
  const requestSequenceRef = React.useRef(0);
  const cacheRef = React.useRef<Map<string, CachedAutocompleteEntry>>(new Map());
  const latestQueryRef = React.useRef(query);
  const latestIsSuggestionScreenActiveRef = React.useRef(isSuggestionScreenActive);
  const latestIsSuggestionScreenVisibleRef = React.useRef(isSuggestionScreenVisible);
  const latestIsAutocompleteSuppressedRef = React.useRef(isAutocompleteSuppressed);
  const manuallySuppressedRef = React.useRef(false);

  React.useEffect(() => {
    latestQueryRef.current = query;
  }, [query]);

  React.useEffect(() => {
    latestIsSuggestionScreenActiveRef.current = isSuggestionScreenActive;
  }, [isSuggestionScreenActive]);

  React.useEffect(() => {
    latestIsSuggestionScreenVisibleRef.current = isSuggestionScreenVisible;
  }, [isSuggestionScreenVisible]);

  React.useEffect(() => {
    latestIsAutocompleteSuppressedRef.current = isAutocompleteSuppressed;
    if (!isAutocompleteSuppressed) {
      manuallySuppressedRef.current = false;
    }
  }, [isAutocompleteSuppressed]);

  const clearSuggestions = React.useCallback(() => {
    writeAutocompleteSuggestions(setSuggestions, setShowSuggestions, []);
  }, [setShowSuggestions, setSuggestions]);

  const readCache = React.useCallback(
    (rawQuery: string): AutocompleteMatch[] | null => {
      const normalized = normalizeAutocompleteQuery(rawQuery);
      if (!normalized) {
        return null;
      }
      const cached = cacheRef.current.get(normalized);
      if (!cached) {
        return null;
      }
      if (Date.now() - cached.updatedAtMs > autocompleteCacheTtlMs) {
        cacheRef.current.delete(normalized);
        return null;
      }
      // Refresh recency (LRU-ish)
      cacheRef.current.delete(normalized);
      cacheRef.current.set(normalized, cached);
      return cached.matches;
    },
    [autocompleteCacheTtlMs]
  );

  const writeCache = React.useCallback((rawQuery: string, matches: AutocompleteMatch[]) => {
    const normalized = normalizeAutocompleteQuery(rawQuery);
    if (!normalized) {
      return;
    }
    if (cacheRef.current.has(normalized)) {
      cacheRef.current.delete(normalized);
    }
    cacheRef.current.set(normalized, {
      query: rawQuery,
      matches,
      updatedAtMs: Date.now(),
    });
    while (cacheRef.current.size > MAX_AUTOCOMPLETE_CACHE_ENTRIES) {
      const oldestKey = cacheRef.current.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      cacheRef.current.delete(oldestKey);
    }
  }, []);

  const showCachedSuggestionsIfFresh = React.useCallback(
    (rawQuery: string): boolean => {
      const cached = readCache(rawQuery);
      if (!cached) {
        return false;
      }
      writeAutocompleteSuggestions(setSuggestions, setShowSuggestions, cached);
      return true;
    },
    [readCache, setShowSuggestions, setSuggestions]
  );

  const suppressAutocompleteResults = React.useCallback(() => {
    manuallySuppressedRef.current = true;
    requestSequenceRef.current += 1;
    cancelAutocomplete();
    clearSuggestions();
  }, [cancelAutocomplete, clearSuggestions]);

  const allowAutocompleteResults = React.useCallback(() => {
    manuallySuppressedRef.current = false;
  }, []);

  React.useEffect(() => {
    const trimmed = query.trim();
    const isSuppressed = isAutocompleteSuppressed || manuallySuppressedRef.current;
    const shouldRun = isSuggestionScreenActive && !isSuppressed;

    if (!shouldRun) {
      requestSequenceRef.current += 1;
      cancelAutocomplete();
      if (!isSuggestionScreenActive && !isSuggestionScreenVisible && !trimmed.length) {
        clearSuggestions();
      }
      return;
    }

    if (trimmed.length < autocompleteMinChars) {
      requestSequenceRef.current += 1;
      cancelAutocomplete();
      clearSuggestions();
      return;
    }

    const cached = readCache(trimmed);
    if (cached) {
      writeAutocompleteSuggestions(setSuggestions, setShowSuggestions, cached);
    }

    const requestSequence = ++requestSequenceRef.current;
    void runAutocomplete(trimmed, {
      bounds: latestBoundsRef.current,
      userLocation: userLocationRef.current,
    })
      .then((matches) => {
        if (requestSequence !== requestSequenceRef.current) {
          return;
        }
        const latestTrimmedQuery = latestQueryRef.current.trim();
        if (
          normalizeAutocompleteQuery(latestTrimmedQuery) !== normalizeAutocompleteQuery(trimmed)
        ) {
          return;
        }
        const isLatestSuppressed =
          latestIsAutocompleteSuppressedRef.current || manuallySuppressedRef.current;
        if (isLatestSuppressed || !latestIsSuggestionScreenActiveRef.current) {
          return;
        }
        writeCache(trimmed, matches);
        writeAutocompleteSuggestions(setSuggestions, setShowSuggestions, matches);
      })
      .catch(() => {
        if (requestSequence !== requestSequenceRef.current) {
          return;
        }
        clearSuggestions();
      });

    return () => {
      requestSequenceRef.current += 1;
      cancelAutocomplete();
    };
  }, [
    autocompleteMinChars,
    cancelAutocomplete,
    clearSuggestions,
    isAutocompleteSuppressed,
    isSuggestionScreenActive,
    isSuggestionScreenVisible,
    latestBoundsRef,
    query,
    readCache,
    runAutocomplete,
    setShowSuggestions,
    setSuggestions,
    userLocationRef,
    writeCache,
  ]);

  React.useEffect(
    () => () => {
      requestSequenceRef.current += 1;
      cancelAutocomplete();
    },
    [cancelAutocomplete]
  );

  return {
    suppressAutocompleteResults,
    allowAutocompleteResults,
    showCachedSuggestionsIfFresh,
  };
};
