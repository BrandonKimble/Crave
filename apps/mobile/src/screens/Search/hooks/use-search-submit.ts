import React from 'react';
import { Keyboard } from 'react-native';

import type { UseSearchRequestsResult } from '../../../hooks/useSearchRequests';
import { logger } from '../../../utils';
import type { Coordinate, MapBounds, NaturalSearchRequest, SearchResponse } from '../../../types';
import type { StructuredSearchRequest } from '../../../services/search';
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
  updateLocalRecentSearches: (value: string) => void;
};

type UseSearchSubmitResult = {
  submitSearch: (options?: SubmitSearchOptions, overrideQuery?: string) => Promise<void>;
  runBestHere: (
    targetTab: SegmentValue,
    submittedLabel: string,
    options?: { preserveSheetState?: boolean }
  ) => Promise<void>;
  loadMoreResults: (searchMode: SearchMode) => void;
  cancelActiveSearchRequest: () => void;
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

  const cancelActiveSearchRequest = React.useCallback(() => {
    cancelSearch();
    activeSearchRequestRef.current = ++searchRequestSeqRef.current;
    setIsLoading(false);
    setIsLoadingMore(false);
  }, [cancelSearch, setIsLoading, setIsLoadingMore]);

  const handleSearchResponse = React.useCallback(
    (
      response: SearchResponse,
      options: {
        append: boolean;
        targetPage: number;
        submittedLabel?: string;
        pushToHistory?: boolean;
      }
    ) => {
      const { append, targetPage, submittedLabel, pushToHistory } = options;

      let previousFoodCountSnapshot = 0;
      let previousRestaurantCountSnapshot = 0;
      let mergedFoodCount = response.food?.length ?? 0;
      let mergedRestaurantCount = response.restaurants?.length ?? 0;

      setResults((prev) => {
        const base = append ? prev : null;
        previousFoodCountSnapshot = base?.food?.length ?? 0;
        previousRestaurantCountSnapshot = base?.restaurants?.length ?? 0;
        const merged = mergeSearchResponses(base, response, append);
        mergedFoodCount = merged.food?.length ?? 0;
        mergedRestaurantCount = merged.restaurants?.length ?? 0;
        return merged;
      });

      const singleRestaurantCandidate = resolveSingleRestaurantCandidate(response);

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

      if (!append) {
        lastSearchRequestIdRef.current = response.metadata.searchRequestId ?? null;
        if (submittedLabel) {
          setSubmittedQuery(submittedLabel);
        } else {
          setSubmittedQuery('');
        }

        const singleRestaurant = resolveSingleRestaurantCandidate(response);

        if (!singleRestaurant) {
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

        if (submittedLabel && pushToHistory) {
          const hasEntityTargets = [
            ...(response.plan?.restaurantFilters ?? []),
            ...(response.plan?.connectionFilters ?? []),
          ].some((filter) => Array.isArray(filter.entityIds) && filter.entityIds.length > 0);

          if (hasEntityTargets) {
            updateLocalRecentSearches(submittedLabel);
          }

          void loadRecentHistory({ force: true });
        }

        Keyboard.dismiss();
        setIsPaginationExhausted(false);
        scrollResultsToTop();

        if (singleRestaurant) {
          resetSheetToHidden();
        } else {
          showPanel();
        }
      }
    },
    [
      lastSearchRequestIdRef,
      loadRecentHistory,
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
    async (page: number): Promise<StructuredSearchRequest> => {
      const pagination = { page, pageSize: DEFAULT_PAGE_SIZE };
      const payload: StructuredSearchRequest = {
        entities: {},
        pagination,
      };

      const effectiveOpenNow = openNow;
      const normalizedPriceLevels = normalizePriceFilter(priceLevels);
      const effectiveMinimumVotes = votes100Plus ? MINIMUM_VOTES_FILTER : null;

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
      if (shouldCaptureBounds) {
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
        }
      }

      if (!payload.bounds && latestBoundsRef.current) {
        payload.bounds = latestBoundsRef.current;
      }

      const resolvedLocation = userLocationRef.current ?? (await ensureUserLocation());
      if (resolvedLocation) {
        payload.userLocation = resolvedLocation;
      }

      return payload;
    },
    [
      ensureUserLocation,
      latestBoundsRef,
      mapRef,
      openNow,
      priceLevels,
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
          setIsLoadingMore(true);
        } else {
          setIsLoading(true);
          setError(null);
          if (!options?.preserveSheetState) {
            setResults(null);
            setSubmittedQuery(trimmed);
            showPanel();
          }
        }

        const payload: NaturalSearchRequest = {
          query: trimmed,
          pagination: { page: targetPage, pageSize: DEFAULT_PAGE_SIZE },
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

        const shouldCaptureBounds = !append && mapRef.current?.getVisibleBounds;
        if (shouldCaptureBounds) {
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
          }
        }

        if (!payload.bounds && latestBoundsRef.current) {
          payload.bounds = latestBoundsRef.current;
        }

        const resolvedLocation = userLocationRef.current ?? (await ensureUserLocation());
        if (resolvedLocation) {
          payload.userLocation = resolvedLocation;
        }

        const response = await runSearch({ kind: 'natural', payload });
        if (response && requestId === activeSearchRequestRef.current) {
          useSystemStatusStore.getState().clearServiceIssue('search');
          logger.info('Search response payload', response);
          const submittedLabel = append ? undefined : trimmed;
          handleSearchResponse(response, {
            append,
            targetPage,
            submittedLabel,
            pushToHistory: !append,
          });
        }
      } catch (err) {
        logger.error('Search request failed', { message: (err as Error).message });
        if (requestId === activeSearchRequestRef.current) {
          if (!append) {
            showPanel();
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

  const runBestHere = React.useCallback(
    async (
      targetTab: SegmentValue,
      submittedLabel: string,
      options?: { preserveSheetState?: boolean }
    ) => {
      if (isLoading || isLoadingMore) {
        return;
      }

      resetMapMoveFlag();
      const preserveSheetState = Boolean(options?.preserveSheetState);
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
      lastAutoOpenKeyRef.current = null;
      setIsAutocompleteSuppressed(true);
      setShowSuggestions(false);
      Keyboard.dismiss();

      try {
        setIsLoading(true);
        const payload = await buildStructuredSearchPayload(1);
        const response = await runSearch({ kind: 'structured', payload });
        if (response) {
          logger.info('Structured search response payload', response);
          handleSearchResponse(response, {
            append: false,
            targetPage: 1,
            submittedLabel,
            pushToHistory: false,
          });
        }
      } catch (err) {
        logger.error('Best here request failed', {
          message: err instanceof Error ? err.message : 'unknown error',
        });
        setError(null);
        showPanel();
      } finally {
        setIsLoading(false);
      }
    },
    [
      buildStructuredSearchPayload,
      handleSearchResponse,
      isLoading,
      isLoadingMore,
      lastAutoOpenKeyRef,
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
      setIsPaginationExhausted,
      setIsSearchSessionActive,
      setSearchMode,
      setShowSuggestions,
      showPanel,
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
        const response = await runSearch({ kind: 'structured', payload });
        if (response) {
          logger.info('Structured search pagination payload', response);
          handleSearchResponse(response, {
            append: true,
            targetPage: nextPage,
            submittedLabel: submittedQuery || 'Best dishes here',
            pushToHistory: false,
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
    handleSearchResponse,
    isLoading,
    isLoadingMore,
    isPaginationExhausted,
    results,
    runSearch,
    setError,
    setIsLoadingMore,
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
    runBestHere,
    loadMoreResults,
    cancelActiveSearchRequest,
  };
};

export default useSearchSubmit;
