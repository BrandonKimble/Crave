import * as React from 'react';
import axios from 'axios';

import {
  searchService,
  type NaturalSearchRequest,
  type SearchResponse,
  type StructuredSearchRequest,
} from '../services/search';
import { autocompleteService, type AutocompleteMatch } from '../services/autocomplete';
import type { Coordinate, MapBounds } from '../types';

type RunAutocompleteOptions = {
  debounceMs?: number;
  bounds?: MapBounds | null;
  userLocation?: Coordinate | null;
};

type RunSearchParams =
  | {
      kind: 'natural';
      payload: NaturalSearchRequest;
      debugParse?: boolean;
      debugLabel?: string;
      debugMinMs?: number;
    }
  | {
      kind: 'structured';
      payload: StructuredSearchRequest;
      debugParse?: boolean;
      debugLabel?: string;
      debugMinMs?: number;
    };

export const useSearchRequests = () => {
  const searchControllerRef = React.useRef<AbortController | null>(null);
  const autocompleteControllerRef = React.useRef<AbortController | null>(null);
  const autocompleteDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateLimitUntilRef = React.useRef(0);

  const getRetryAfterMs = React.useCallback((error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return null;
    }
    const headers = error.response?.headers;
    if (!headers) {
      return null;
    }

    const candidates = [
      headers['retry-after-long'],
      headers['retry-after-medium'],
      headers['retry-after-short'],
      headers['retry-after'],
    ];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string' && typeof candidate !== 'number') {
        continue;
      }
      const value = typeof candidate === 'number' ? candidate : Number.parseFloat(candidate);
      if (!Number.isFinite(value) || value <= 0) {
        continue;
      }
      return value * 1000;
    }

    return null;
  }, []);

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
        const debounceMs = options.debounceMs ?? 0; // Instant autocomplete like Google
        cancelAutocomplete();

        autocompleteDebounceRef.current = setTimeout(async () => {
          const controller = new AbortController();
          autocompleteControllerRef.current = controller;
          setIsAutocompleteLoading(true);

          try {
            const response = await autocompleteService.fetchEntities(query, {
              signal: controller.signal,
              bounds: options.bounds,
              userLocation: options.userLocation,
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
      const now = Date.now();
      if (now < rateLimitUntilRef.current) {
        const waitMs = rateLimitUntilRef.current - now;
        const rateLimitError = new Error(
          `Too many requests. Try again in ${Math.ceil(waitMs / 100) / 10}s.`
        );
        (rateLimitError as Error & { code?: string }).code = 'RATE_LIMITED';
        throw rateLimitError;
      }

      cancelSearch();
      const controller = new AbortController();
      searchControllerRef.current = controller;
      setIsSearching(true);

      try {
        const response =
          request.kind === 'natural'
            ? await searchService.naturalSearch(request.payload, {
                signal: controller.signal,
                debugParse: request.debugParse,
                debugLabel: request.debugLabel,
                debugMinMs: request.debugMinMs,
              })
            : await searchService.structuredSearch(request.payload, {
                signal: controller.signal,
                debugParse: request.debugParse,
                debugLabel: request.debugLabel,
                debugMinMs: request.debugMinMs,
              });

        if (controller.signal.aborted) {
          return null;
        }

        return response;
      } catch (error) {
        if (controller.signal.aborted) {
          return null;
        }
        const status = axios.isAxiosError(error)
          ? (typeof error.response?.status === 'number' ? error.response.status : null)
          : null;
        if (status === 429) {
          const retryAfterMs = getRetryAfterMs(error) ?? 2000;
          rateLimitUntilRef.current = Math.max(rateLimitUntilRef.current, Date.now() + retryAfterMs);
        }
        throw error;
      } finally {
        if (searchControllerRef.current === controller) {
          setIsSearching(false);
          searchControllerRef.current = null;
        }
      }
    },
    [cancelSearch, getRetryAfterMs]
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
