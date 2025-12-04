import * as React from 'react';

import {
  searchService,
  type NaturalSearchRequest,
  type SearchResponse,
  type StructuredSearchRequest,
} from '../services/search';
import { autocompleteService, type AutocompleteMatch } from '../services/autocomplete';

type RunAutocompleteOptions = {
  debounceMs?: number;
};

type RunSearchParams =
  | { kind: 'natural'; payload: NaturalSearchRequest }
  | { kind: 'structured'; payload: StructuredSearchRequest };

export const useSearchRequests = () => {
  const searchControllerRef = React.useRef<AbortController | null>(null);
  const autocompleteControllerRef = React.useRef<AbortController | null>(null);
  const autocompleteDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isSearching, setIsSearching] = React.useState(false);
  const [isAutocompleteLoading, setIsAutocompleteLoading] = React.useState(false);

  const cancelAutocomplete = React.useCallback(() => {
    if (autocompleteDebounceRef.current) {
      clearTimeout(autocompleteDebounceRef.current);
      autocompleteDebounceRef.current = null;
    }
    if (autocompleteControllerRef.current) {
      autocompleteControllerRef.current.abort();
      autocompleteControllerRef.current = null;
    }
    setIsAutocompleteLoading(false);
  }, []);

  const cancelSearch = React.useCallback(() => {
    if (searchControllerRef.current) {
      searchControllerRef.current.abort();
      searchControllerRef.current = null;
    }
    setIsSearching(false);
  }, []);

  const cancelAll = React.useCallback(() => {
    cancelAutocomplete();
    cancelSearch();
  }, [cancelAutocomplete, cancelSearch]);

  const runAutocomplete = React.useCallback(
    (query: string, options: RunAutocompleteOptions = {}) =>
      new Promise<AutocompleteMatch[]>((resolve) => {
        const debounceMs = options.debounceMs ?? 250;
        cancelAutocomplete();

        autocompleteDebounceRef.current = setTimeout(async () => {
          const controller = new AbortController();
          autocompleteControllerRef.current = controller;
          setIsAutocompleteLoading(true);

          try {
            const response = await autocompleteService.fetchEntities(query, {
              signal: controller.signal,
            });

            if (!controller.signal.aborted) {
              resolve(response.matches);
            } else {
              resolve([]);
            }
          } catch (error) {
            if (controller.signal.aborted) {
              resolve([]);
            } else {
              resolve([]);
            }
          } finally {
            if (autocompleteControllerRef.current === controller) {
              setIsAutocompleteLoading(false);
              autocompleteControllerRef.current = null;
            }
          }
        }, debounceMs);
      }),
    [cancelAutocomplete]
  );

  const runSearch = React.useCallback(
    async (request: RunSearchParams): Promise<SearchResponse | null> => {
      cancelSearch();
      const controller = new AbortController();
      searchControllerRef.current = controller;
      setIsSearching(true);

      try {
        const response =
          request.kind === 'natural'
            ? await searchService.naturalSearch(request.payload, { signal: controller.signal })
            : await searchService.structuredSearch(request.payload, {
                signal: controller.signal,
              });

        if (controller.signal.aborted) {
          return null;
        }

        return response;
      } catch (error) {
        if (controller.signal.aborted) {
          return null;
        }
        throw error;
      } finally {
        if (searchControllerRef.current === controller) {
          setIsSearching(false);
          searchControllerRef.current = null;
        }
      }
    },
    [cancelSearch]
  );

  React.useEffect(() => cancelAll, [cancelAll]);

  return {
    runAutocomplete,
    runSearch,
    cancelAutocomplete,
    cancelSearch,
    cancelAll,
    isSearching,
    isAutocompleteLoading,
  };
};

export type UseSearchRequestsResult = ReturnType<typeof useSearchRequests>;
