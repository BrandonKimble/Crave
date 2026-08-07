import React from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import { AUTOCOMPLETE_CACHE_TTL_MS, MAX_AUTOCOMPLETE_CACHE_ENTRIES } from '../../constants/search';
import {
  normalizeAutocompleteQuery,
  writeAutocompleteSuggestions,
} from './search-autocomplete-request-runtime';
import { filterAutocompletePlaceholderMatches } from './search-autocomplete-placeholder-filter';

type CachedAutocompleteEntry = {
  matches: AutocompleteMatch[];
  updatedAtMs: number;
};

/**
 * F6004: A CACHE ENTRY'S KEY IS THE COMPLETE SET OF INPUTS THAT PRODUCED IT.
 *
 * Entries used to be keyed by folded query text alone, with the request's scope
 * (viewport bounds, and — absent from the old key entirely — the userLocation
 * the request also carries) applied as a wholesale `cache.clear()` in an effect
 * keyed on the scope. That is right only AFTER commit, and this map is read
 * during RENDER by the lifecycle memo: on a render where the query and the
 * bounds bucket move in the same pass, the memo could return an entry minted
 * under the previous scope and the panel would show it once — in a family whose
 * two written rules are "never blank" and "never flash stale rows".
 *
 * The scope is part of the key now. Cross-scope reuse is unrepresentable rather
 * than cleaned up after; the clearing effect is gone; entries from a previous
 * scope survive until LRU evicts them, which costs the same bounded peak
 * (MAX_AUTOCOMPLETE_CACHE_ENTRIES) and turns a pan-back into a HIT.
 *
 * `\u0000` cannot occur in a folded query, so the split is unambiguous — which
 * matters because the prefix-placeholder scan must compare query text WITHIN a
 * scope, never across.
 */
const CACHE_KEY_SEPARATOR = '\u0000';

const buildCacheKey = (scopeKey: string, normalizedQuery: string): string =>
  `${scopeKey}${CACHE_KEY_SEPARATOR}${normalizedQuery}`;

const readCacheKeyQuery = (key: string, scopeKey: string): string | null => {
  const prefix = `${scopeKey}${CACHE_KEY_SEPARATOR}`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
};

type CachedAutocompleteLookup = {
  matches: AutocompleteMatch[];
  isExactMatch: boolean;
};

type UseSearchAutocompleteCacheRuntimeArgs = {
  cancelAutocomplete: () => void;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  cacheScopeKey: string;
};

type SearchAutocompleteCacheRuntime = {
  clearAutocompleteSuggestions: () => void;
  lookupAutocompleteCache: (rawQuery: string) => CachedAutocompleteLookup | null;
  writeAutocompleteCache: (rawQuery: string, matches: AutocompleteMatch[]) => void;
  showCachedSuggestionsIfFresh: (rawQuery: string) => boolean;
};

export const useSearchAutocompleteCacheRuntime = ({
  cancelAutocomplete,
  setSuggestions,
  cacheScopeKey,
}: UseSearchAutocompleteCacheRuntimeArgs): SearchAutocompleteCacheRuntime => {
  const autocompleteCacheRef = React.useRef<Map<string, CachedAutocompleteEntry>>(new Map());

  const clearAutocompleteSuggestions = React.useCallback(() => {
    writeAutocompleteSuggestions(setSuggestions, []);
  }, [setSuggestions]);

  const lookupAutocompleteCache = React.useCallback(
    (rawQuery: string): CachedAutocompleteLookup | null => {
      const normalized = normalizeAutocompleteQuery(rawQuery);
      if (!normalized) {
        return null;
      }

      const now = Date.now();
      const exact = autocompleteCacheRef.current.get(buildCacheKey(cacheScopeKey, normalized));
      if (exact) {
        const exactKey = buildCacheKey(cacheScopeKey, normalized);
        autocompleteCacheRef.current.delete(exactKey);
        if (now - exact.updatedAtMs <= AUTOCOMPLETE_CACHE_TTL_MS) {
          autocompleteCacheRef.current.set(exactKey, exact);
          return {
            matches: exact.matches,
            isExactMatch: true,
          };
        }
      }

      const staleKeys: string[] = [];
      const prefixCandidates: Array<{
        key: string;
        query: string;
        entry: CachedAutocompleteEntry;
      }> = [];
      for (const [key, entry] of autocompleteCacheRef.current.entries()) {
        if (now - entry.updatedAtMs > AUTOCOMPLETE_CACHE_TTL_MS) {
          staleKeys.push(key);
          continue;
        }
        const query = readCacheKeyQuery(key, cacheScopeKey);
        if (query == null || normalized === query || !normalized.startsWith(query)) {
          continue;
        }
        prefixCandidates.push({ key, query, entry });
      }

      staleKeys.forEach((key) => {
        autocompleteCacheRef.current.delete(key);
      });

      // Never-blank rule (a) (plans/suggest-ideal-shape.md refit layer 2): a
      // prefix entry only serves as a placeholder AFTER a client-side filter to
      // rows whose text still contains the typed query — the old unfiltered
      // placeholder flashed stale rows. Longest matching prefix wins; when its
      // filtered set is empty, shorter prefixes get a turn; when nothing
      // survives, return null so the caller keeps the PREVIOUS list while the
      // fresh request loads (rule b: never blank the panel on a keystroke).
      prefixCandidates.sort((left, right) => right.query.length - left.query.length);
      for (const candidate of prefixCandidates) {
        const filteredMatches = filterAutocompletePlaceholderMatches(
          candidate.entry.matches,
          normalized
        );
        if (filteredMatches.length === 0) {
          continue;
        }
        autocompleteCacheRef.current.delete(candidate.key);
        autocompleteCacheRef.current.set(candidate.key, candidate.entry);
        return {
          matches: filteredMatches,
          isExactMatch: false,
        };
      }

      return null;
    },
    [cacheScopeKey]
  );

  const writeAutocompleteCache = React.useCallback(
    (rawQuery: string, matches: AutocompleteMatch[]) => {
      const normalized = normalizeAutocompleteQuery(rawQuery);
      if (!normalized) {
        return;
      }
      const key = buildCacheKey(cacheScopeKey, normalized);
      autocompleteCacheRef.current.delete(key);
      autocompleteCacheRef.current.set(key, {
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
    [cacheScopeKey]
  );

  const showCachedSuggestionsIfFresh = React.useCallback(
    (rawQuery: string): boolean => {
      const cached = lookupAutocompleteCache(rawQuery);
      if (!cached) {
        return false;
      }
      writeAutocompleteSuggestions(setSuggestions, cached.matches);
      cancelAutocomplete();
      return true;
    },
    [cancelAutocomplete, lookupAutocompleteCache, setSuggestions]
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
