import React from 'react';

import { logger } from '../../../../utils';
import type { AutocompleteMatch } from '../../../../services/autocomplete';
import { AUTOCOMPLETE_CACHE_TTL_MS, AUTOCOMPLETE_MIN_CHARS } from '../../constants/search';

type CachedAutocompleteEntry = {
  matches: AutocompleteMatch[];
  updatedAtMs: number;
};

type CachedAutocompleteLookup = {
  matches: AutocompleteMatch[];
  isExactMatch: boolean;
};

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
  const autocompleteRequestSequenceRef = React.useRef(0);
  const autocompleteCacheRef = React.useRef<Map<string, CachedAutocompleteEntry>>(new Map());
  const latestAutocompleteQueryRef = React.useRef(query);
  const latestSuggestionScreenActiveRef = React.useRef(isSuggestionScreenActive);
  const latestAutocompleteSuppressedRef = React.useRef(isAutocompleteSuppressed);
  const manuallySuppressedAutocompleteRef = React.useRef(false);

  latestAutocompleteQueryRef.current = query;
  latestSuggestionScreenActiveRef.current = isSuggestionScreenActive;
  latestAutocompleteSuppressedRef.current = isAutocompleteSuppressed;
  if (!isAutocompleteSuppressed) {
    manuallySuppressedAutocompleteRef.current = false;
  }

  const clearAutocompleteSuggestions = React.useCallback(() => {
    writeAutocompleteSuggestions(setSuggestions, setShowSuggestions, []);
  }, [setShowSuggestions, setSuggestions]);

  const lookupAutocompleteCache = React.useCallback(
    (rawQuery: string): CachedAutocompleteLookup | null => {
      const normalized = normalizeAutocompleteQuery(rawQuery);
      if (!normalized) {
        return null;
      }

      const now = Date.now();
      const exact = autocompleteCacheRef.current.get(normalized);
      if (exact) {
        if (now - exact.updatedAtMs <= AUTOCOMPLETE_CACHE_TTL_MS) {
          autocompleteCacheRef.current.delete(normalized);
          autocompleteCacheRef.current.set(normalized, exact);
          return {
            matches: exact.matches,
            isExactMatch: true,
          };
        }
        autocompleteCacheRef.current.delete(normalized);
      }

      const staleKeys: string[] = [];
      let bestPrefixKey: string | null = null;
      let bestPrefixEntry: CachedAutocompleteEntry | null = null;
      for (const [key, entry] of autocompleteCacheRef.current.entries()) {
        if (now - entry.updatedAtMs > AUTOCOMPLETE_CACHE_TTL_MS) {
          staleKeys.push(key);
          continue;
        }
        if (normalized === key || !normalized.startsWith(key)) {
          continue;
        }
        if (bestPrefixKey && key.length <= bestPrefixKey.length) {
          continue;
        }
        bestPrefixKey = key;
        bestPrefixEntry = entry;
      }

      staleKeys.forEach((key) => {
        autocompleteCacheRef.current.delete(key);
      });

      if (!bestPrefixKey || !bestPrefixEntry) {
        return null;
      }

      autocompleteCacheRef.current.delete(bestPrefixKey);
      autocompleteCacheRef.current.set(bestPrefixKey, bestPrefixEntry);
      return {
        matches: bestPrefixEntry.matches,
        isExactMatch: false,
      };
    },
    []
  );

  const writeAutocompleteCache = React.useCallback(
    (rawQuery: string, matches: AutocompleteMatch[]) => {
      const normalized = normalizeAutocompleteQuery(rawQuery);
      if (!normalized) {
        return;
      }
      if (autocompleteCacheRef.current.has(normalized)) {
        autocompleteCacheRef.current.delete(normalized);
      }
      autocompleteCacheRef.current.set(normalized, {
        matches,
        updatedAtMs: Date.now(),
      });
      while (autocompleteCacheRef.current.size > MAX_AUTOCOMPLETE_CACHE_ENTRIES) {
        const oldestKey = autocompleteCacheRef.current.keys().next().value as string | undefined;
        if (!oldestKey) {
          break;
        }
        autocompleteCacheRef.current.delete(oldestKey);
      }
    },
    []
  );

  const showCachedSuggestionsIfFresh = React.useCallback(
    (rawQuery: string): boolean => {
      const cached = lookupAutocompleteCache(rawQuery);
      if (!cached) {
        return false;
      }
      writeAutocompleteSuggestions(setSuggestions, setShowSuggestions, cached.matches);
      cancelAutocomplete();
      return true;
    },
    [cancelAutocomplete, lookupAutocompleteCache, setShowSuggestions, setSuggestions]
  );

  const suppressAutocompleteResults = React.useCallback(() => {
    manuallySuppressedAutocompleteRef.current = true;
    autocompleteRequestSequenceRef.current += 1;
    cancelAutocomplete();
  }, [cancelAutocomplete]);

  const allowAutocompleteResults = React.useCallback(() => {
    manuallySuppressedAutocompleteRef.current = false;
  }, []);

  React.useEffect(() => {
    const trimmed = query.trim();
    const isSuppressed = isAutocompleteSuppressed || manuallySuppressedAutocompleteRef.current;
    const shouldRun = isSuggestionScreenActive && !isSuppressed;

    if (!shouldRun) {
      autocompleteRequestSequenceRef.current += 1;
      cancelAutocomplete();
      if (!isSuggestionPanelVisible) {
        clearAutocompleteSuggestions();
      }
      return;
    }

    if (trimmed.length < AUTOCOMPLETE_MIN_CHARS) {
      autocompleteRequestSequenceRef.current += 1;
      cancelAutocomplete();
      clearAutocompleteSuggestions();
      return;
    }

    const cached = lookupAutocompleteCache(trimmed);
    if (cached) {
      writeAutocompleteSuggestions(setSuggestions, setShowSuggestions, cached.matches);
      if (cached.isExactMatch) {
        cancelAutocomplete();
        return;
      }
    }

    const requestSequence = ++autocompleteRequestSequenceRef.current;
    let isActive = true;
    void runAutocomplete(trimmed, { debounceMs: AUTOCOMPLETE_DEBOUNCE_MS })
      .then((matches) => {
        if (!isActive || requestSequence !== autocompleteRequestSequenceRef.current) {
          return;
        }
        const latestTrimmedQuery = latestAutocompleteQueryRef.current.trim();
        if (
          normalizeAutocompleteQuery(latestTrimmedQuery) !== normalizeAutocompleteQuery(trimmed)
        ) {
          return;
        }
        const isLatestSuppressed =
          latestAutocompleteSuppressedRef.current || manuallySuppressedAutocompleteRef.current;
        if (isLatestSuppressed || !latestSuggestionScreenActiveRef.current) {
          return;
        }
        writeAutocompleteCache(trimmed, matches);
        writeAutocompleteSuggestions(setSuggestions, setShowSuggestions, matches);
      })
      .catch((error) => {
        if (!isActive || requestSequence !== autocompleteRequestSequenceRef.current) {
          return;
        }
        const isLatestSuppressed =
          latestAutocompleteSuppressedRef.current || manuallySuppressedAutocompleteRef.current;
        if (isLatestSuppressed || !latestSuggestionScreenActiveRef.current) {
          return;
        }
        logger.warn('Autocomplete request failed', {
          message: error instanceof Error ? error.message : 'unknown error',
        });
        clearAutocompleteSuggestions();
      });

    return () => {
      isActive = false;
      autocompleteRequestSequenceRef.current += 1;
      cancelAutocomplete();
    };
  }, [
    cancelAutocomplete,
    clearAutocompleteSuggestions,
    isAutocompleteSuppressed,
    isSuggestionPanelVisible,
    isSuggestionScreenActive,
    lookupAutocompleteCache,
    query,
    runAutocomplete,
    setShowSuggestions,
    setSuggestions,
    writeAutocompleteCache,
  ]);

  React.useEffect(
    () => () => {
      autocompleteRequestSequenceRef.current += 1;
      cancelAutocomplete();
    },
    [cancelAutocomplete]
  );

  return {
    showCachedSuggestionsIfFresh,
    suppressAutocompleteResults,
    allowAutocompleteResults,
  };
};
