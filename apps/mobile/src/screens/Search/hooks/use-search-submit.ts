import React from 'react';
import { InteractionManager, Keyboard, unstable_batchedUpdates } from 'react-native';

import type { UseSearchRequestsResult } from '../../../hooks/useSearchRequests';
import { logger } from '../../../utils';
import searchPerfDebug from '../search-perf-debug';
import type { Coordinate, MapBounds, NaturalSearchRequest, SearchResponse } from '../../../types';
import type { RecentSearch, StructuredSearchRequest } from '../../../services/search';
import { useSystemStatusStore } from '../../../store/systemStatusStore';
import type { SegmentValue } from '../constants/search';
import { DEFAULT_PAGE_SIZE, MINIMUM_VOTES_FILTER } from '../constants/search';
import type { MapboxMapRef } from '../components/search-map';
import { boundsFromPairs, isLngLatTuple } from '../utils/geo';
import { mergeSearchResponses } from '../utils/merge';
import { normalizePriceFilter } from '../utils/price';
import { resolveSingleRestaurantCandidate } from '../utils/response';

type SearchMode = 'natural' | 'shortcut' | null;

type SubmitSearchOptions = {
  openNow?: boolean;
  priceLevels?: number[] | null;
  minimumVotes?: number | null;
  page?: number;
  append?: boolean;
  preserveSheetState?: boolean;
  submission?: {
    source: NaturalSearchRequest['submissionSource'];
    context?: NaturalSearchRequest['submissionContext'];
  };
};

type StructuredSearchFilters = Pick<
  SubmitSearchOptions,
  'openNow' | 'priceLevels' | 'minimumVotes'
>;

type UseSearchSubmitOptions = {
  query: string;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  isLoadingMore: boolean;
  setIsLoadingMore: React.Dispatch<React.SetStateAction<boolean>>;
  results: SearchResponse | null;
  setResults: React.Dispatch<React.SetStateAction<SearchResponse | null>>;
  submittedQuery: string;
  setSubmittedQuery: React.Dispatch<React.SetStateAction<string>>;
  activeTab: SegmentValue;
  setActiveTab: React.Dispatch<React.SetStateAction<SegmentValue>>;
  setHasMoreFood: React.Dispatch<React.SetStateAction<boolean>>;
  setHasMoreRestaurants: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  isPaginationExhausted: boolean;
  setIsPaginationExhausted: React.Dispatch<React.SetStateAction<boolean>>;
  canLoadMore: boolean;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSearchSessionActive: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchMode: React.Dispatch<React.SetStateAction<SearchMode>>;
  setIsAutocompleteSuppressed: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  showPanel: () => void;
  resetSheetToHidden: () => void;
  scrollResultsToTop: () => void;
  lastSearchRequestIdRef: React.MutableRefObject<string | null>;
  lastAutoOpenKeyRef: React.MutableRefObject<string | null>;
  openNow: boolean;
  priceLevels: number[];
  votes100Plus: boolean;
  runSearch: UseSearchRequestsResult['runSearch'];
  cancelSearch: UseSearchRequestsResult['cancelSearch'];
  mapRef: React.RefObject<MapboxMapRef | null>;
  latestBoundsRef: React.MutableRefObject<MapBounds | null>;
  ensureUserLocation: () => Promise<Coordinate | null>;
  userLocationRef: React.MutableRefObject<Coordinate | null>;
  resetMapMoveFlag: () => void;
  loadRecentHistory: (options?: { force?: boolean }) => Promise<void>;
  updateLocalRecentSearches: (value: string | RecentSearchInput) => void;
};

type RecentSearchInput = {
  queryText: string;
  selectedEntityId?: string | null;
  selectedEntityType?: RecentSearch['selectedEntityType'] | null;
  statusPreview?: RecentSearch['statusPreview'] | null;
};

type UseSearchSubmitResult = {
  submitSearch: (options?: SubmitSearchOptions, overrideQuery?: string) => Promise<void>;
  runRestaurantEntitySearch: (params: {
    restaurantId: string;
    restaurantName: string;
    submissionSource: NaturalSearchRequest['submissionSource'];
    typedPrefix?: string;
    preserveSheetState?: boolean;
  }) => Promise<void>;
  runBestHere: (
    targetTab: SegmentValue,
    submittedLabel: string,
    options?: { preserveSheetState?: boolean; filters?: StructuredSearchFilters }
  ) => Promise<void>;
  loadMoreResults: (searchMode: SearchMode) => void;
  cancelActiveSearchRequest: () => void;
};

const logSearchResponsePayload = (label: string, response: SearchResponse, enabled: boolean) => {
  if (!enabled) {
    return;
  }
  logger.debug(`${label} payload`, response);
};

const getPerfNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const useSearchSubmit = ({
  query,
  isLoading,
  setIsLoading,
  isLoadingMore,
  setIsLoadingMore,
  results,
  setResults,
  submittedQuery,
  setSubmittedQuery,
  setActiveTab,
  setHasMoreFood,
  setHasMoreRestaurants,
  currentPage,
  setCurrentPage,
  isPaginationExhausted,
  setIsPaginationExhausted,
  canLoadMore,
  setError,
  setIsSearchSessionActive,
  setSearchMode,
  setIsAutocompleteSuppressed,
  setShowSuggestions,
  showPanel,
  resetSheetToHidden,
  scrollResultsToTop,
  lastSearchRequestIdRef,
  lastAutoOpenKeyRef,
  openNow,
  priceLevels,
  votes100Plus,
  runSearch,
  cancelSearch,
  mapRef,
  latestBoundsRef,
  ensureUserLocation,
  userLocationRef,
  resetMapMoveFlag,
  loadRecentHistory,
  updateLocalRecentSearches,
}: UseSearchSubmitOptions): UseSearchSubmitResult => {
  const searchRequestSeqRef = React.useRef(0);
  const activeSearchRequestRef = React.useRef(0);
  const shouldLogSearchResponsePayload = searchPerfDebug.logSearchResponsePayload;
  const shouldLogSearchResponseTimings =
    searchPerfDebug.enabled && searchPerfDebug.logSearchResponseTimings;
  const searchResponseTimingMinMs = searchPerfDebug.logSearchResponseTimingMinMs;
  const shouldDeferBestHereUi = searchPerfDebug.enabled && searchPerfDebug.deferBestHereUi;
  const phaseStartRef = React.useRef<number | null>(null);
  const logSearchResponseTiming = React.useCallback(
    (label: string, durationMs: number) => {
      if (!shouldLogSearchResponseTimings || durationMs < searchResponseTimingMinMs) {
        return;
      }
      // eslint-disable-next-line no-console
      console.log(`[SearchPerf] ${label} ${durationMs.toFixed(1)}ms`);
    },
    [searchResponseTimingMinMs, shouldLogSearchResponseTimings]
  );
  const logSearchPhase = React.useCallback(
    (label: string, options?: { reset?: boolean }) => {
      if (!shouldLogSearchResponseTimings) {
        return;
      }
      const now = getPerfNow();
      if (options?.reset || phaseStartRef.current == null) {
        phaseStartRef.current = now;
      }
      const start = phaseStartRef.current ?? now;
      // eslint-disable-next-line no-console
      console.log(`[SearchPerf] phase ${label} +${(now - start).toFixed(1)}ms`);
    },
    [shouldLogSearchResponseTimings]
  );

  React.useEffect(() => {
    if (!shouldLogSearchResponseTimings) {
      return;
    }
    // eslint-disable-next-line no-console
    console.log('[SearchPerf] response timing logs enabled');
  }, [shouldLogSearchResponseTimings]);

  const cancelActiveSearchRequest = React.useCallback(() => {
    cancelSearch();
    activeSearchRequestRef.current = ++searchRequestSeqRef.current;
    unstable_batchedUpdates(() => {
      setIsLoading(false);
      setIsLoadingMore(false);
    });
  }, [cancelSearch, setIsLoading, setIsLoadingMore]);

  const handleSearchResponse = React.useCallback(
    (
      response: SearchResponse,
      options: {
        append: boolean;
        targetPage: number;
        submittedLabel?: string;
        pushToHistory?: boolean;
        submissionContext?: NaturalSearchRequest['submissionContext'];
        showPanelOnResponse?: boolean;
      }
    ) => {
      const handleStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
      const { append, targetPage, submittedLabel, pushToHistory } = options;

      logSearchPhase('handleSearchResponse:start');
      let previousFoodCountSnapshot = 0;
      let previousRestaurantCountSnapshot = 0;
      let mergedFoodCount = response.food?.length ?? 0;
      let mergedRestaurantCount = response.restaurants?.length ?? 0;

      const singleRestaurantCandidate = resolveSingleRestaurantCandidate(response);
      unstable_batchedUpdates(() => {
        setResults((prev) => {
          const base = append ? prev : null;
          previousFoodCountSnapshot = base?.food?.length ?? 0;
          previousRestaurantCountSnapshot = base?.restaurants?.length ?? 0;
          const mergeStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
          const merged = mergeSearchResponses(base, response, append);
          if (shouldLogSearchResponseTimings) {
            logSearchResponseTiming('mergeSearchResponses', getPerfNow() - mergeStart);
          }
          mergedFoodCount = merged.food?.length ?? 0;
          mergedRestaurantCount = merged.restaurants?.length ?? 0;
          return merged;
        });

        if (!singleRestaurantCandidate) {
          const totalFoodAvailable = response.metadata.totalFoodResults ?? mergedFoodCount;
          const totalRestaurantAvailable =
            response.metadata.totalRestaurantResults ?? mergedRestaurantCount;

          const nextHasMoreFood = mergedFoodCount < totalFoodAvailable;
          const nextHasMoreRestaurants =
            response.format === 'dual_list'
              ? mergedRestaurantCount < totalRestaurantAvailable
              : false;

          setHasMoreFood(nextHasMoreFood);
          setHasMoreRestaurants(nextHasMoreRestaurants);
          setCurrentPage(targetPage);

          if (
            append &&
            (!(
              mergedFoodCount > previousFoodCountSnapshot ||
              mergedRestaurantCount > previousRestaurantCountSnapshot
            ) ||
              (!nextHasMoreFood && !nextHasMoreRestaurants))
          ) {
            setIsPaginationExhausted(true);
          }
        }
      });
      logSearchPhase('handleSearchResponse:state-applied');
      if (!append) {
        requestAnimationFrame(() => {
          unstable_batchedUpdates(() => {
            lastSearchRequestIdRef.current = response.metadata.searchRequestId ?? null;
            if (submittedLabel) {
              setSubmittedQuery(submittedLabel);
            } else {
              setSubmittedQuery('');
            }

            if (!singleRestaurantCandidate) {
              const hasFoodResults = response?.food?.length > 0;
              const hasRestaurantsResults =
                (response?.restaurants?.length ?? 0) > 0 || response?.format === 'single_list';

              setActiveTab((prevTab) => {
                if (prevTab === 'dishes' && hasFoodResults) {
                  return 'dishes';
                }
                if (prevTab === 'restaurants' && hasRestaurantsResults) {
                  return 'restaurants';
                }
                return hasFoodResults ? 'dishes' : 'restaurants';
              });
            }

            setIsPaginationExhausted(false);

            if (singleRestaurantCandidate) {
              resetSheetToHidden();
            } else if (options.showPanelOnResponse) {
              showPanel();
            }
          });
          logSearchPhase('handleSearchResponse:ui-deferred');
        });
      }

      if (!append && submittedLabel && pushToHistory) {
        const hasEntityTargets = [
          ...(response.plan?.restaurantFilters ?? []),
          ...(response.plan?.connectionFilters ?? []),
        ].some((filter) => Array.isArray(filter.entityIds) && filter.entityIds.length > 0);

        const enqueueHistoryUpdate = () => {
          if (hasEntityTargets) {
            const contextRecord =
              options.submissionContext &&
              typeof options.submissionContext === 'object' &&
              !Array.isArray(options.submissionContext)
                ? (options.submissionContext as Record<string, unknown>)
                : null;
            const selectedEntityId =
              typeof contextRecord?.selectedEntityId === 'string'
                ? contextRecord.selectedEntityId
                : null;
            const selectedEntityType =
              contextRecord?.selectedEntityType === 'restaurant' ? 'restaurant' : null;
            updateLocalRecentSearches({
              queryText: submittedLabel,
              selectedEntityId,
              selectedEntityType,
            });
          }

          void loadRecentHistory({ force: true });
        };
        void InteractionManager.runAfterInteractions(enqueueHistoryUpdate);
        logSearchPhase('handleSearchResponse:history-deferred');
      }

      if (!append) {
        Keyboard.dismiss();
        scrollResultsToTop();
      }
      logSearchPhase('handleSearchResponse:done');
      if (shouldLogSearchResponseTimings) {
        logSearchResponseTiming('handleSearchResponse', getPerfNow() - handleStart);
      }
    },
    [
      lastSearchRequestIdRef,
      loadRecentHistory,
      logSearchPhase,
      resetSheetToHidden,
      scrollResultsToTop,
      setActiveTab,
      setCurrentPage,
      setHasMoreFood,
      setHasMoreRestaurants,
      setIsPaginationExhausted,
      setResults,
      setSubmittedQuery,
      showPanel,
      updateLocalRecentSearches,
    ]
  );

  const buildStructuredSearchPayload = React.useCallback(
    async (
      page: number,
      filters: StructuredSearchFilters = {}
    ): Promise<StructuredSearchRequest> => {
      const buildStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
      const pagination = { page, pageSize: DEFAULT_PAGE_SIZE };
      const payload: StructuredSearchRequest = {
        entities: {},
        pagination,
        includeSqlPreview: false,
      };

      const effectiveOpenNow = filters.openNow ?? openNow;
      const effectivePriceLevels =
        filters.priceLevels !== undefined ? filters.priceLevels : priceLevels;
      const normalizedPriceLevels = normalizePriceFilter(effectivePriceLevels);
      const effectiveMinimumVotes =
        filters.minimumVotes !== undefined
          ? filters.minimumVotes
          : votes100Plus
          ? MINIMUM_VOTES_FILTER
          : null;

      if (effectiveOpenNow) {
        payload.openNow = true;
      }

      if (normalizedPriceLevels.length > 0) {
        payload.priceLevels = normalizedPriceLevels;
      }

      if (typeof effectiveMinimumVotes === 'number' && effectiveMinimumVotes > 0) {
        payload.minimumVotes = effectiveMinimumVotes;
      }

      const shouldCaptureBounds = page === 1 && mapRef.current?.getVisibleBounds;
      if (shouldCaptureBounds && !latestBoundsRef.current) {
        const boundsStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
        try {
          const visibleBounds = await mapRef.current!.getVisibleBounds();
          if (
            Array.isArray(visibleBounds) &&
            visibleBounds.length >= 2 &&
            isLngLatTuple(visibleBounds[0]) &&
            isLngLatTuple(visibleBounds[1])
          ) {
            payload.bounds = boundsFromPairs(visibleBounds[0], visibleBounds[1]);
            latestBoundsRef.current = payload.bounds;
          }
        } catch (boundsError) {
          logger.warn('Unable to determine map bounds before submitting structured search', {
            message: boundsError instanceof Error ? boundsError.message : 'unknown error',
          });
        } finally {
          if (shouldLogSearchResponseTimings && boundsStart > 0) {
            logSearchResponseTiming('getVisibleBounds:structured', getPerfNow() - boundsStart);
          }
        }
      }

      if (!payload.bounds && latestBoundsRef.current) {
        payload.bounds = latestBoundsRef.current;
      }

      const resolvedLocation = userLocationRef.current ?? (await ensureUserLocation());
      if (resolvedLocation) {
        payload.userLocation = resolvedLocation;
      }

      if (shouldLogSearchResponseTimings && buildStart > 0) {
        logSearchResponseTiming('buildStructuredSearchPayload', getPerfNow() - buildStart);
      }
      return payload;
    },
    [
      ensureUserLocation,
      latestBoundsRef,
      logSearchResponseTiming,
      mapRef,
      openNow,
      priceLevels,
      shouldLogSearchResponseTimings,
      userLocationRef,
      votes100Plus,
    ]
  );

  const submitSearch = React.useCallback(
    async (options?: SubmitSearchOptions, overrideQuery?: string) => {
      const append = Boolean(options?.append);
      if (append && (isLoading || isLoadingMore)) {
        return;
      }
      logSearchPhase('submitSearch:start', { reset: true });
      if (!append) {
        resetMapMoveFlag();
      }

      const targetPage = options?.page && options.page > 0 ? options.page : 1;
      const baseQuery = overrideQuery ?? query;
      const trimmed = baseQuery.trim();
      if (!trimmed) {
        if (!append) {
          setResults(null);
          setSubmittedQuery('');
          setError(null);
          setHasMoreFood(false);
          setHasMoreRestaurants(false);
          setCurrentPage(1);
        }
        return;
      }
      const requestId = ++searchRequestSeqRef.current;
      activeSearchRequestRef.current = requestId;

      if (!append) {
        const preserveSheetState = Boolean(options?.preserveSheetState);
        unstable_batchedUpdates(() => {
          if (!preserveSheetState) {
            resetSheetToHidden();
          }
          setSearchMode('natural');
          setIsSearchSessionActive(true);
          setIsAutocompleteSuppressed(true);
          setShowSuggestions(false);
          setHasMoreFood(false);
          setHasMoreRestaurants(false);
          setCurrentPage(targetPage);
        });
        logSearchPhase('submitSearch:ui-prep');
        lastAutoOpenKeyRef.current = null;
      }

      const effectiveOpenNow = options?.openNow ?? openNow;
      const effectivePriceLevels =
        options?.priceLevels !== undefined ? options.priceLevels : priceLevels;
      const normalizedPriceLevels = normalizePriceFilter(effectivePriceLevels);
      const effectiveMinimumVotes =
        options?.minimumVotes !== undefined
          ? options.minimumVotes
          : votes100Plus
          ? MINIMUM_VOTES_FILTER
          : null;

      try {
        if (append) {
          unstable_batchedUpdates(() => {
            setIsLoadingMore(true);
          });
          logSearchPhase('submitSearch:loading-more');
        } else {
          unstable_batchedUpdates(() => {
            setIsLoading(true);
            setError(null);
            if (!options?.preserveSheetState) {
              setResults(null);
              setSubmittedQuery(trimmed);
              showPanel();
            }
          });
          logSearchPhase('submitSearch:loading-state');
        }

        const payload: NaturalSearchRequest = {
          query: trimmed,
          pagination: { page: targetPage, pageSize: DEFAULT_PAGE_SIZE },
          includeSqlPreview: false,
        };

        if (!append) {
          payload.submissionSource = options?.submission?.source ?? 'manual';
          if (options?.submission?.context) {
            payload.submissionContext = options.submission.context;
          }
        }

        if (effectiveOpenNow) {
          payload.openNow = true;
        }

        if (normalizedPriceLevels.length > 0) {
          payload.priceLevels = normalizedPriceLevels;
        }

        if (typeof effectiveMinimumVotes === 'number' && effectiveMinimumVotes > 0) {
          payload.minimumVotes = effectiveMinimumVotes;
        }
        logSearchPhase('submitSearch:payload-ready');

        const shouldCaptureBounds = !append && mapRef.current?.getVisibleBounds;
        if (shouldCaptureBounds && !latestBoundsRef.current) {
          const boundsStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
          try {
            const visibleBounds = await mapRef.current!.getVisibleBounds();
            if (
              Array.isArray(visibleBounds) &&
              visibleBounds.length >= 2 &&
              isLngLatTuple(visibleBounds[0]) &&
              isLngLatTuple(visibleBounds[1])
            ) {
              payload.bounds = boundsFromPairs(visibleBounds[0], visibleBounds[1]);
              latestBoundsRef.current = payload.bounds;
            }
          } catch (boundsError) {
            logger.warn('Unable to determine map bounds before submitting search', {
              message: boundsError instanceof Error ? boundsError.message : 'unknown error',
            });
          } finally {
            if (shouldLogSearchResponseTimings && boundsStart > 0) {
              logSearchResponseTiming('getVisibleBounds:natural', getPerfNow() - boundsStart);
            }
          }
        }

        if (!payload.bounds && latestBoundsRef.current) {
          payload.bounds = latestBoundsRef.current;
        }

        const resolvedLocation = userLocationRef.current ?? (await ensureUserLocation());
        if (resolvedLocation) {
          payload.userLocation = resolvedLocation;
        }

        logSearchPhase('submitSearch:runSearch');
        const requestStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
        const response = await runSearch({
          kind: 'natural',
          payload,
          debugParse: shouldLogSearchResponseTimings,
          debugLabel: 'natural',
          debugMinMs: searchResponseTimingMinMs,
        });
        if (shouldLogSearchResponseTimings) {
          logSearchResponseTiming('runSearch:natural', getPerfNow() - requestStart);
        }
        logSearchPhase('submitSearch:response');
        if (response && requestId === activeSearchRequestRef.current) {
          useSystemStatusStore.getState().clearServiceIssue('search');
          logSearchResponsePayload('Search response', response, shouldLogSearchResponsePayload);
          const submittedLabel = append ? undefined : trimmed;
          handleSearchResponse(response, {
            append,
            targetPage,
            submittedLabel,
            pushToHistory: !append,
            submissionContext: options?.submission?.context,
            showPanelOnResponse: false,
          });
        }
      } catch (err) {
        logger.error('Search request failed', { message: (err as Error).message });
        if (requestId === activeSearchRequestRef.current) {
          if (!append) {
            setError(null);
          } else {
            setError('Unable to load more results. Please try again.');
          }
        }
      } finally {
        if (requestId === activeSearchRequestRef.current) {
          if (append) {
            setIsLoadingMore(false);
          } else {
            setIsLoading(false);
          }
        }
      }
    },
    [
      ensureUserLocation,
      handleSearchResponse,
      isLoading,
      isLoadingMore,
      lastAutoOpenKeyRef,
      latestBoundsRef,
      logSearchPhase,
      shouldLogSearchResponsePayload,
      mapRef,
      openNow,
      priceLevels,
      query,
      resetMapMoveFlag,
      resetSheetToHidden,
      runSearch,
      setCurrentPage,
      setError,
      setHasMoreFood,
      setHasMoreRestaurants,
      setIsAutocompleteSuppressed,
      setIsLoading,
      setIsLoadingMore,
      setIsSearchSessionActive,
      setResults,
      setSearchMode,
      setShowSuggestions,
      setSubmittedQuery,
      showPanel,
      userLocationRef,
      votes100Plus,
    ]
  );

  const runRestaurantEntitySearch = React.useCallback(
    async (params: {
      restaurantId: string;
      restaurantName: string;
      submissionSource: NaturalSearchRequest['submissionSource'];
      typedPrefix?: string;
      preserveSheetState?: boolean;
    }) => {
      logSearchPhase('runRestaurantEntitySearch:start', { reset: true });
      const requestId = ++searchRequestSeqRef.current;
      activeSearchRequestRef.current = requestId;

      resetMapMoveFlag();
      const preserveSheetState = Boolean(params.preserveSheetState);
      setSearchMode('natural');
      setIsSearchSessionActive(true);
      setError(null);
      if (!preserveSheetState) {
        resetSheetToHidden();
      }
      setHasMoreFood(false);
      setHasMoreRestaurants(false);
      setIsPaginationExhausted(false);
      setCurrentPage(1);
      lastAutoOpenKeyRef.current = null;
      setIsAutocompleteSuppressed(true);
      setShowSuggestions(false);
      Keyboard.dismiss();
      logSearchPhase('runRestaurantEntitySearch:ui-prep');

      const trimmedName = params.restaurantName.trim();
      if (!trimmedName) {
        return;
      }

      try {
        if (isLoadingMore) {
          setIsLoadingMore(false);
        }
        setIsLoading(true);
        logSearchPhase('runRestaurantEntitySearch:loading-state');
        const payload = await buildStructuredSearchPayload(1, {
          openNow: false,
          priceLevels: [],
          minimumVotes: 0,
        });
        payload.entities = {
          restaurants: [
            {
              normalizedName: trimmedName,
              entityIds: [params.restaurantId],
              originalText: trimmedName,
            },
          ],
        };
        payload.sourceQuery = trimmedName;
        payload.submissionSource = params.submissionSource;
        const submissionContext = {
          typedPrefix: params.typedPrefix ?? trimmedName,
          matchType: 'entity',
          selectedEntityId: params.restaurantId,
          selectedEntityType: 'restaurant',
        };
        payload.submissionContext = submissionContext;
        logSearchPhase('runRestaurantEntitySearch:runSearch');

        const requestStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
        const response = await runSearch({
          kind: 'structured',
          payload,
          debugParse: shouldLogSearchResponseTimings,
          debugLabel: 'structured',
          debugMinMs: searchResponseTimingMinMs,
        });
        if (shouldLogSearchResponseTimings) {
          logSearchResponseTiming('runSearch:structured', getPerfNow() - requestStart);
        }
        logSearchPhase('runRestaurantEntitySearch:response');
        if (response && requestId === activeSearchRequestRef.current) {
          logSearchResponsePayload(
            'Structured restaurant search response',
            response,
            shouldLogSearchResponsePayload
          );
          handleSearchResponse(response, {
            append: false,
            targetPage: 1,
            submittedLabel: trimmedName,
            pushToHistory: true,
            submissionContext,
            showPanelOnResponse: false,
          });
        }
      } catch (err) {
        logger.error('Structured restaurant search failed', {
          message: err instanceof Error ? err.message : 'unknown error',
        });
        if (requestId === activeSearchRequestRef.current) {
          setError(null);
        }
      } finally {
        if (requestId === activeSearchRequestRef.current) {
          setIsLoading(false);
        }
      }
    },
    [
      buildStructuredSearchPayload,
      handleSearchResponse,
      isLoadingMore,
      lastAutoOpenKeyRef,
      logSearchPhase,
      shouldLogSearchResponsePayload,
      resetMapMoveFlag,
      resetSheetToHidden,
      runSearch,
      setCurrentPage,
      setError,
      setHasMoreFood,
      setHasMoreRestaurants,
      setIsAutocompleteSuppressed,
      setIsLoading,
      setIsLoadingMore,
      setIsPaginationExhausted,
      setIsSearchSessionActive,
      setSearchMode,
      setShowSuggestions,
      showPanel,
      logSearchResponseTiming,
      shouldLogSearchResponseTimings,
    ]
  );

  const runBestHere = React.useCallback(
    async (
      targetTab: SegmentValue,
      submittedLabel: string,
      options?: { preserveSheetState?: boolean; filters?: StructuredSearchFilters }
    ) => {
      logSearchPhase('runBestHere:start', { reset: true });
      const requestId = ++searchRequestSeqRef.current;
      activeSearchRequestRef.current = requestId;

      resetMapMoveFlag();
      const preserveSheetState = Boolean(options?.preserveSheetState);
      const suppressSuggestionsNow = () => {
        unstable_batchedUpdates(() => {
          setIsAutocompleteSuppressed(true);
          setShowSuggestions(false);
        });
        lastAutoOpenKeyRef.current = null;
      };
      const applyBestHereUiState = () => {
        unstable_batchedUpdates(() => {
          setSearchMode('shortcut');
          setIsSearchSessionActive(true);
          setActiveTab(targetTab);
          setError(null);
          if (!preserveSheetState) {
            resetSheetToHidden();
          }
          setHasMoreFood(false);
          setHasMoreRestaurants(false);
          setIsPaginationExhausted(false);
          setCurrentPage(1);
          setIsAutocompleteSuppressed(true);
          setShowSuggestions(false);
        });
        lastAutoOpenKeyRef.current = null;
        Keyboard.dismiss();
      };
      if (shouldDeferBestHereUi) {
        suppressSuggestionsNow();
        logSearchPhase('runBestHere:suppress-suggestions');
      } else {
        applyBestHereUiState();
        logSearchPhase('runBestHere:ui-prep');
      }

      try {
        if (isLoadingMore) {
          unstable_batchedUpdates(() => {
            setIsLoadingMore(false);
          });
          logSearchPhase('runBestHere:loading-more');
        }
        if (!shouldDeferBestHereUi) {
          unstable_batchedUpdates(() => {
            setIsLoading(true);
            if (!preserveSheetState) {
              showPanel();
            }
          });
          logSearchPhase('runBestHere:loading-state');
        }
        const payload = await buildStructuredSearchPayload(1, options?.filters);
        logSearchPhase('runBestHere:runSearch');
        const requestStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
        const response = await runSearch({
          kind: 'structured',
          payload,
          debugParse: shouldLogSearchResponseTimings,
          debugLabel: 'bestHere',
          debugMinMs: searchResponseTimingMinMs,
        });
        if (shouldLogSearchResponseTimings) {
          logSearchResponseTiming('runSearch:bestHere', getPerfNow() - requestStart);
        }
        logSearchPhase('runBestHere:response');
        if (response && requestId === activeSearchRequestRef.current) {
          if (shouldDeferBestHereUi) {
            applyBestHereUiState();
            logSearchPhase('runBestHere:ui-prep');
          }
          logSearchResponsePayload(
            'Structured search response',
            response,
            shouldLogSearchResponsePayload
          );
          handleSearchResponse(response, {
            append: false,
            targetPage: 1,
            submittedLabel,
            pushToHistory: false,
            showPanelOnResponse: shouldDeferBestHereUi && !preserveSheetState,
          });
        }
      } catch (err) {
        logger.error('Best here request failed', {
          message: err instanceof Error ? err.message : 'unknown error',
        });
        if (requestId === activeSearchRequestRef.current) {
          setError(null);
        }
      } finally {
        if (requestId === activeSearchRequestRef.current) {
          setIsLoading(false);
        }
      }
    },
    [
      buildStructuredSearchPayload,
      handleSearchResponse,
      isLoadingMore,
      lastAutoOpenKeyRef,
      logSearchPhase,
      shouldLogSearchResponsePayload,
      resetMapMoveFlag,
      resetSheetToHidden,
      runSearch,
      setActiveTab,
      setCurrentPage,
      setError,
      setHasMoreFood,
      setHasMoreRestaurants,
      setIsAutocompleteSuppressed,
      setIsLoading,
      setIsLoadingMore,
      setIsPaginationExhausted,
      setIsSearchSessionActive,
      setSearchMode,
      setShowSuggestions,
      showPanel,
      shouldDeferBestHereUi,
    ]
  );

  const loadMoreShortcutResults = React.useCallback(() => {
    if (isLoading || isLoadingMore || !results || !canLoadMore || isPaginationExhausted) {
      return;
    }

    const nextPage = currentPage + 1;

    const run = async () => {
      try {
        setIsLoadingMore(true);
        const payload = await buildStructuredSearchPayload(nextPage);
        const requestStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
        const response = await runSearch({
          kind: 'structured',
          payload,
          debugParse: shouldLogSearchResponseTimings,
          debugLabel: 'pagination',
          debugMinMs: searchResponseTimingMinMs,
        });
        if (shouldLogSearchResponseTimings) {
          logSearchResponseTiming('runSearch:pagination', getPerfNow() - requestStart);
        }
        if (response) {
          logSearchResponsePayload(
            'Structured search pagination',
            response,
            shouldLogSearchResponsePayload
          );
          handleSearchResponse(response, {
            append: true,
            targetPage: nextPage,
            submittedLabel: submittedQuery || 'Best dishes here',
            pushToHistory: false,
            showPanelOnResponse: false,
          });
        }
      } catch (err) {
        logger.error('Best dishes here pagination failed', {
          message: err instanceof Error ? err.message : 'unknown error',
        });
        setError('Unable to load more results. Please try again.');
      } finally {
        setIsLoadingMore(false);
      }
    };

    void run();
  }, [
    buildStructuredSearchPayload,
    canLoadMore,
    currentPage,
    getPerfNow,
    handleSearchResponse,
    isLoading,
    isLoadingMore,
    isPaginationExhausted,
    logSearchResponseTiming,
    results,
    runSearch,
    searchResponseTimingMinMs,
    setError,
    setIsLoadingMore,
    shouldLogSearchResponsePayload,
    shouldLogSearchResponseTimings,
    submittedQuery,
  ]);

  const loadMoreResults = React.useCallback(
    (searchMode: SearchMode) => {
      if (isLoading || isLoadingMore || !results || !canLoadMore || isPaginationExhausted) {
        return;
      }
      if (searchMode === 'shortcut') {
        loadMoreShortcutResults();
        return;
      }
      const nextPage = currentPage + 1;
      const activeQuery = submittedQuery || query;
      if (!activeQuery.trim()) {
        return;
      }
      void submitSearch({ page: nextPage, append: true }, activeQuery);
    },
    [
      canLoadMore,
      currentPage,
      isLoading,
      isLoadingMore,
      isPaginationExhausted,
      loadMoreShortcutResults,
      query,
      results,
      submittedQuery,
      submitSearch,
    ]
  );

  return {
    submitSearch,
    runRestaurantEntitySearch,
    runBestHere,
    loadMoreResults,
    cancelActiveSearchRequest,
  };
};

export default useSearchSubmit;
