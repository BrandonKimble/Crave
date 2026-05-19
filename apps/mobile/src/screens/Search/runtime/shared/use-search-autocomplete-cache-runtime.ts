import React from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import { AUTOCOMPLETE_CACHE_TTL_MS } from '../../constants/search';

type CachedAutocompleteEntry = {
  matches: AutocompleteMatch[];
  updatedAtMs: number;
};

type CachedAutocompleteLookup = {
  matches: AutocompleteMatch[];
  isExactMatch: boolean;
};

type UseSearchAutocompleteCacheRuntimeArgs = {
  cancelAutocomplete: () => void;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  cacheScopeKey: string;
};

type SearchAutocompleteCacheRuntime = {
  clearAutocompleteSuggestions: () => void;
  lookupAutocompleteCache: (rawQuery: string) => CachedAutocompleteLookup | null;
  writeAutocompleteCache: (rawQuery: string, matches: AutocompleteMatch[]) => void;
  showCachedSuggestionsIfFresh: (rawQuery: string) => boolean;
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

export const useSearchAutocompleteCacheRuntime = ({
  cancelAutocomplete,
  setSuggestions,
  setShowSuggestions,
  cacheScopeKey,
}: UseSearchAutocompleteCacheRuntimeArgs): SearchAutocompleteCacheRuntime => {
  const autocompleteCacheRef = React.useRef<Map<string, CachedAutocompleteEntry>>(new Map());

  React.useEffect(() => {
    autocompleteCacheRef.current.clear();
  }, [cacheScopeKey]);

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

  return React.useMemo(
    () => ({
      clearAutocompleteSuggestions,
      lookupAutocompleteCache,
      writeAutocompleteCache,
      showCachedSuggestionsIfFresh,
    }),
    [
      clearAutocompleteSuggestions,
      lookupAutocompleteCache,
      showCachedSuggestionsIfFresh,
      writeAutocompleteCache,
    ]
  );
};
