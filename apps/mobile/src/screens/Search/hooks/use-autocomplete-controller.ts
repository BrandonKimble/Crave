import React from 'react';

import type { AutocompleteMatch } from '../../../services/autocomplete';
import { logger } from '../../../utils';

type UseAutocompleteControllerArgs = {
  query: string;
  isSuggestionScreenActive: boolean;
  isSuggestionScreenVisible: boolean;
  isAutocompleteSuppressed: boolean;
  runAutocomplete: (
    query: string,
    options?: {
      debounceMs?: number;
    }
  ) => Promise<AutocompleteMatch[]>;
  cancelAutocomplete: () => void;
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
type CachedAutocompleteLookup = {
  matches: AutocompleteMatch[];
  isExactMatch: boolean;
};

type UseAutocompleteControllerResult = {
  suppressAutocompleteResults: () => void;
  allowAutocompleteResults: () => void;
  showCachedSuggestionsIfFresh: (query: string) => boolean;
};

const MAX_AUTOCOMPLETE_CACHE_ENTRIES = 64;
const AUTOCOMPLETE_DEBOUNCE_MS = 0;

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

  const lookupCache = React.useCallback(
    (rawQuery: string): CachedAutocompleteLookup | null => {
      const normalized = normalizeAutocompleteQuery(rawQuery);
      if (!normalized) {
        return null;
      }
      const now = Date.now();
      const exact = cacheRef.current.get(normalized);
      if (exact) {
        if (now - exact.updatedAtMs <= autocompleteCacheTtlMs) {
          // Refresh recency (LRU-ish)
          cacheRef.current.delete(normalized);
          cacheRef.current.set(normalized, exact);
          return {
            matches: exact.matches,
            isExactMatch: true,
          };
        }
        cacheRef.current.delete(normalized);
      }

      const staleKeys: string[] = [];
      let bestPrefixKey: string | null = null;
      let bestPrefixEntry: CachedAutocompleteEntry | null = null;
      for (const [key, entry] of cacheRef.current.entries()) {
        if (now - entry.updatedAtMs > autocompleteCacheTtlMs) {
          staleKeys.push(key);
          continue;
        }
        if (normalized === key) {
          continue;
        }
        if (!normalized.startsWith(key)) {
          continue;
        }
        if (bestPrefixKey && key.length <= bestPrefixKey.length) {
          continue;
        }
        bestPrefixKey = key;
        bestPrefixEntry = entry;
      }
      staleKeys.forEach((key) => {
        cacheRef.current.delete(key);
      });
      if (!bestPrefixKey || !bestPrefixEntry) {
        return null;
      }
      // Refresh recency on the prefix entry we are about to reuse.
      cacheRef.current.delete(bestPrefixKey);
      cacheRef.current.set(bestPrefixKey, bestPrefixEntry);
      return {
        matches: bestPrefixEntry.matches,
        isExactMatch: false,
      };
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
      const cached = lookupCache(rawQuery);
      if (!cached) {
        return false;
      }
      writeAutocompleteSuggestions(setSuggestions, setShowSuggestions, cached.matches);
      cancelAutocomplete();
      return true;
    },
    [cancelAutocomplete, lookupCache, setShowSuggestions, setSuggestions]
  );

  const suppressAutocompleteResults = React.useCallback(() => {
    manuallySuppressedRef.current = true;
    requestSequenceRef.current += 1;
    cancelAutocomplete();
  }, [cancelAutocomplete]);

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
      if (!isSuggestionScreenVisible) {
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

    const cached = lookupCache(trimmed);
    if (cached) {
      writeAutocompleteSuggestions(setSuggestions, setShowSuggestions, cached.matches);
      if (cached.isExactMatch) {
        cancelAutocomplete();
        return;
      }
    }

    const requestSequence = ++requestSequenceRef.current;
    let isActive = true;
    void runAutocomplete(trimmed, {
      debounceMs: AUTOCOMPLETE_DEBOUNCE_MS,
    })
      .then((matches) => {
        if (!isActive) {
          return;
        }
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
      .catch((error) => {
        if (!isActive) {
          return;
        }
        if (requestSequence !== requestSequenceRef.current) {
          return;
        }
        const isLatestSuppressed =
          latestIsAutocompleteSuppressedRef.current || manuallySuppressedRef.current;
        if (isLatestSuppressed || !latestIsSuggestionScreenActiveRef.current) {
          return;
        }
        logger.warn('Autocomplete request failed', {
          message: error instanceof Error ? error.message : 'unknown error',
        });
        clearSuggestions();
      });

    return () => {
      isActive = false;
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
    lookupCache,
    query,
    runAutocomplete,
    setShowSuggestions,
    setSuggestions,
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
