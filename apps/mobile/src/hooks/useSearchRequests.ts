// F840: ONE declaration of these readers (perf/search-request-telemetry) — they were
// byte-identical copies of services/search.ts's, describing the SAME requests.
import {
  getSearchLifecycleErrorFields,
  readRequestBoundsSummary,
} from '../perf/search-request-telemetry';

import * as React from 'react';
import axios from 'axios';

import {
  searchService,
  type NaturalSearchRequest,
  type SearchRequestCacheStatus,
  type SearchResponse,
  type StructuredSearchRequest,
} from '../services/search';
import { autocompleteService, type AutocompleteMatch } from '../services/autocomplete';
import { logPerfScenarioSearchRequestLifecycle } from '../perf/perf-scenario-attribution';
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
      onCacheStatus?: (status: SearchRequestCacheStatus) => void;
    }
  | {
      kind: 'structured';
      payload: StructuredSearchRequest;
      debugParse?: boolean;
      debugLabel?: string;
      debugMinMs?: number;
      onCacheStatus?: (status: SearchRequestCacheStatus) => void;
    };

/** F4800: the abort verdict is OBSERVED here (`controller.signal.aborted`) and CARRIED,
 *  not discarded. runSearch used to return `SearchResponse | null`, the fetch layer turned
 *  the null into `throw new Error('… returned no response')`, and the resolver
 *  reconstructed the boolean by string-matching that sentence — three lossy hops to
 *  recover a fact that was in hand at the top, with a `.includes('canceled')` arm that
 *  silently demoted any real backend failure whose message contained the word. */
export type RunSearchOutcome = { kind: 'response'; response: SearchResponse } | { kind: 'aborted' };

const getPerfNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const readRequestStringField = (payload: unknown, key: string): string | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const getRunSearchPayloadSummary = (request: RunSearchParams): Record<string, unknown> => {
  const query = readRequestStringField(request.payload, 'query');
  const sourceQuery = readRequestStringField(request.payload, 'sourceQuery');
  const searchRequestId = readRequestStringField(request.payload, 'searchRequestId');
  const pagination =
    request.payload &&
    typeof request.payload === 'object' &&
    !Array.isArray(request.payload) &&
    'pagination' in request.payload
      ? (request.payload as unknown as Record<string, unknown>).pagination
      : null;
  const page =
    pagination && typeof pagination === 'object' && !Array.isArray(pagination)
      ? (pagination as Record<string, unknown>).page
      : null;
  return {
    payloadSearchRequestId: searchRequestId,
    payloadPage: typeof page === 'number' && Number.isFinite(page) ? page : null,
    queryLength: query == null ? null : query.length,
    sourceQueryLength: sourceQuery == null ? null : sourceQuery.length,
    debugLabel: request.debugLabel ?? null,
    ...readRequestBoundsSummary(request.payload),
  };
};

const logRunSearchLifecycle = (
  phase: string,
  requestAttemptId: number,
  request: RunSearchParams,
  payload: Record<string, unknown> = {}
): void => {
  logPerfScenarioSearchRequestLifecycle({
    source: 'useSearchRequests.runSearch',
    phase,
    requestAttemptId,
    kind: request.kind,
    ...getRunSearchPayloadSummary(request),
    ...payload,
  });
};

const summarizeAutocompleteMatches = (matches: AutocompleteMatch[]): Record<string, unknown> => {
  const byEntityType: Record<string, number> = {};
  const byQuerySuggestionSource: Record<string, number> = {};
  let querySuggestionCount = 0;
  let attributeCount = 0;

  matches.forEach((match) => {
    const entityType = match.entityType || 'unknown';
    byEntityType[entityType] = (byEntityType[entityType] ?? 0) + 1;
    if (match.matchType === 'query' || match.entityType === 'query') {
      querySuggestionCount += 1;
      const source = match.querySuggestionSource ?? 'unknown';
      byQuerySuggestionSource[source] = (byQuerySuggestionSource[source] ?? 0) + 1;
    }
    if (match.entityType === 'item_attribute' || match.entityType === 'place_attribute') {
      attributeCount += 1;
    }
  });

  return {
    autocompleteMatchCount: matches.length,
    autocompleteByEntityType: byEntityType,
    autocompleteByQuerySuggestionSource: byQuerySuggestionSource,
    autocompleteQuerySuggestionCount: querySuggestionCount,
    autocompleteAttributeCount: attributeCount,
    autocompleteTopMatches: matches.slice(0, 7).map((match) => ({
      entityType: match.entityType,
      matchType: match.matchType ?? null,
      name: match.name,
      querySuggestionSource: match.querySuggestionSource ?? null,
    })),
  };
};

export const useSearchRequests = () => {
  const searchControllerRef = React.useRef<AbortController | null>(null);
  const autocompleteControllerRef = React.useRef<AbortController | null>(null);
  const autocompleteDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateLimitUntilRef = React.useRef(0);
  const searchAttemptSeqRef = React.useRef(0);
  const autocompleteAttemptSeqRef = React.useRef(0);

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
  const isAutocompleteLoadingRef = React.useRef(false);
  const updateAutocompleteLoading = React.useCallback((nextValue: boolean) => {
    if (isAutocompleteLoadingRef.current === nextValue) {
      return;
    }
    isAutocompleteLoadingRef.current = nextValue;
    setIsAutocompleteLoading(nextValue);
  }, []);

  const cancelAutocomplete = React.useCallback(() => {
    if (autocompleteDebounceRef.current) {
      clearTimeout(autocompleteDebounceRef.current);
      autocompleteDebounceRef.current = null;
    }
    if (autocompleteControllerRef.current) {
      autocompleteControllerRef.current.abort();
      autocompleteControllerRef.current = null;
    }
    updateAutocompleteLoading(false);
  }, [updateAutocompleteLoading]);

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
      new Promise<AutocompleteMatch[]>((resolve, reject) => {
        const requestAttemptId = ++autocompleteAttemptSeqRef.current;
        const debounceMs = options.debounceMs ?? 0; // Instant autocomplete like Google
        logPerfScenarioSearchRequestLifecycle({
          source: 'useSearchRequests.runAutocomplete',
          phase: 'autocomplete_scheduled',
          requestAttemptId,
          debounceMs,
          queryLength: query.trim().length,
          ...readRequestBoundsSummary({ bounds: options.bounds ?? null }),
        });
        cancelAutocomplete();

        autocompleteDebounceRef.current = setTimeout(async () => {
          const controller = new AbortController();
          autocompleteControllerRef.current = controller;
          updateAutocompleteLoading(true);
          logPerfScenarioSearchRequestLifecycle({
            source: 'useSearchRequests.runAutocomplete',
            phase: 'autocomplete_start',
            requestAttemptId,
            queryLength: query.trim().length,
            ...readRequestBoundsSummary({ bounds: options.bounds ?? null }),
          });

          try {
            const response = await autocompleteService.fetchEntities(query, {
              signal: controller.signal,
              bounds: options.bounds ?? null,
              userLocation: options.userLocation ?? null,
            });
            logPerfScenarioSearchRequestLifecycle({
              source: 'useSearchRequests.runAutocomplete',
              phase: 'autocomplete_response',
              requestAttemptId,
              queryLength: query.trim().length,
              normalizedQueryLength: response.normalizedQuery?.length ?? null,
              ...summarizeAutocompleteMatches(response.matches),
            });

            if (!controller.signal.aborted) {
              resolve(response.matches);
            } else {
              logPerfScenarioSearchRequestLifecycle({
                source: 'useSearchRequests.runAutocomplete',
                phase: 'autocomplete_aborted_after_response',
                requestAttemptId,
                queryLength: query.trim().length,
              });
              resolve([]);
            }
          } catch (error) {
            if (controller.signal.aborted) {
              logPerfScenarioSearchRequestLifecycle({
                source: 'useSearchRequests.runAutocomplete',
                phase: 'autocomplete_aborted',
                requestAttemptId,
                queryLength: query.trim().length,
              });
              resolve([]);
            } else {
              logPerfScenarioSearchRequestLifecycle({
                source: 'useSearchRequests.runAutocomplete',
                phase: 'autocomplete_error',
                requestAttemptId,
                queryLength: query.trim().length,
                ...getSearchLifecycleErrorFields(error),
              });
              // Failures resolve [] quietly BY STANDARD (owner, 2026-07-24):
              // the api client reports service failures to the
              // SystemStatusBanner — the app's one network-trouble channel;
              // the panel just holds its last list (never-blank rule b).
              resolve([]);
            }
          } finally {
            if (autocompleteControllerRef.current === controller) {
              updateAutocompleteLoading(false);
              autocompleteControllerRef.current = null;
            }
          }
        }, debounceMs);
      }),
    [cancelAutocomplete, updateAutocompleteLoading]
  );

  const runSearch = React.useCallback(
    async (request: RunSearchParams): Promise<RunSearchOutcome> => {
      const requestAttemptId = ++searchAttemptSeqRef.current;
      const startedAtMs = getPerfNow();
      const now = Date.now();
      if (now < rateLimitUntilRef.current) {
        const waitMs = rateLimitUntilRef.current - now;
        logRunSearchLifecycle('rate_limited_before_start', requestAttemptId, request, {
          waitMs,
        });
        const rateLimitError = new Error(
          `Too many requests. Try again in ${Math.ceil(waitMs / 100) / 10}s.`
        );
        (rateLimitError as Error & { code?: string }).code = 'RATE_LIMITED';
        throw rateLimitError;
      }

      if (searchControllerRef.current) {
        logRunSearchLifecycle('abort_previous_before_start', requestAttemptId, request);
      }
      cancelSearch();
      const controller = new AbortController();
      searchControllerRef.current = controller;
      setIsSearching(true);
      logRunSearchLifecycle('start', requestAttemptId, request);

      try {
        const response =
          request.kind === 'natural'
            ? await searchService.naturalSearch(request.payload, {
                signal: controller.signal,
                debugParse: request.debugParse,
                debugLabel: request.debugLabel,
                debugMinMs: request.debugMinMs,
                onCacheStatus: request.onCacheStatus,
              })
            : await searchService.structuredSearch(request.payload, {
                signal: controller.signal,
                debugParse: request.debugParse,
                debugLabel: request.debugLabel,
                debugMinMs: request.debugMinMs,
                onCacheStatus: request.onCacheStatus,
              });

        if (controller.signal.aborted) {
          logRunSearchLifecycle('aborted_return', requestAttemptId, request, {
            reason: 'aborted_after_response',
            durationMs: Number((getPerfNow() - startedAtMs).toFixed(3)),
            responseSearchRequestId: response.metadata?.searchRequestId ?? null,
          });
          return { kind: 'aborted' };
        }

        logRunSearchLifecycle('response', requestAttemptId, request, {
          durationMs: Number((getPerfNow() - startedAtMs).toFixed(3)),
          responseSearchRequestId: response.metadata?.searchRequestId ?? null,
          responseOriginalBackendSearchRequestId:
            response.metadata?.originalBackendSearchRequestId ?? null,
          responseDataReadyFrom: response.metadata?.dataReadyFrom ?? 'backend',
          responsePage: response.metadata?.page ?? null,
          responseDishCount: response.dishes?.length ?? 0,
          responseRestaurantCount: response.places?.length ?? 0,
          responseEngineCoverageShare: response.metadata?.engineCoverageShare ?? null,
          responseEngineCount: response.metadata?.engineCoverage?.length ?? 0,
        });
        return { kind: 'response', response };
      } catch (error) {
        if (controller.signal.aborted) {
          logRunSearchLifecycle('aborted_return', requestAttemptId, request, {
            reason: 'aborted_catch',
            durationMs: Number((getPerfNow() - startedAtMs).toFixed(3)),
            ...getSearchLifecycleErrorFields(error),
          });
          return { kind: 'aborted' };
        }
        logRunSearchLifecycle('error', requestAttemptId, request, {
          durationMs: Number((getPerfNow() - startedAtMs).toFixed(3)),
          ...getSearchLifecycleErrorFields(error),
        });
        const status = axios.isAxiosError(error)
          ? typeof error.response?.status === 'number'
            ? error.response.status
            : null
          : null;
        if (status === 429) {
          // PROVENANCE (F839): 2000ms is the fallback for a 429 that arrives WITHOUT a
          // Retry-After header. The server's own value always wins; this only has to be
          // long enough not to hammer a rate limiter and short enough that the user does
          // not read it as a hang. Not measured.
          const retryAfterMs = getRetryAfterMs(error) ?? 2000;
          rateLimitUntilRef.current = Math.max(
            rateLimitUntilRef.current,
            Date.now() + retryAfterMs
          );
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
