import React from 'react';
import { InteractionManager, Keyboard, unstable_batchedUpdates } from 'react-native';
import axios from 'axios';

import type { UseSearchRequestsResult } from '../../../hooks/useSearchRequests';
import { logger } from '../../../utils';
import searchPerfDebug from '../search-perf-debug';
import type { Coordinate, MapBounds, NaturalSearchRequest, SearchResponse } from '../../../types';
import type { RecentSearch, StructuredSearchRequest } from '../../../services/search';
import { useSystemStatusStore } from '../../../store/systemStatusStore';
import type { SegmentValue } from '../constants/search';
import { DEFAULT_PAGE_SIZE, DEFAULT_SEGMENT, MINIMUM_VOTES_FILTER } from '../constants/search';
import type { MapboxMapRef } from '../components/search-map';
import type { SearchSessionController } from '../runtime/controller/search-session-controller';
import type {
  SearchSessionEventPayload,
  SearchSessionEventType,
} from '../runtime/controller/search-session-events';
import {
  createEntityResponseReceivedPayload,
  createEntityShadowEvent,
  createEntitySubmitIntentPayload,
  getEntityShadowOperationId,
} from '../runtime/adapters/entity-adapter';
import {
  createNaturalResponseReceivedPayload,
  createNaturalShadowEvent,
  createNaturalSubmitIntentPayload,
  getNaturalShadowOperationId,
} from '../runtime/adapters/natural-adapter';
import {
  createShortcutResponseReceivedPayload,
  createShortcutShadowEvent,
  createShortcutSubmitIntentPayload,
  getShortcutShadowOperationId,
} from '../runtime/adapters/shortcut-adapter';
import { boundsFromPairs, isLngLatTuple } from '../utils/geo';
import { mergeSearchResponses } from '../utils/merge';
import { normalizePriceFilter } from '../utils/price';
import { resolveSingleRestaurantCandidate } from '../utils/response';

type SearchMode = 'natural' | 'shortcut' | null;
type ShadowMode = 'natural' | 'entity' | 'shortcut';
type RuntimeMechanismEmitter = (
  event: 'runtime_write_span',
  payload?: Record<string, unknown>
) => void;
type SearchSessionShadowTransition = {
  mode: ShadowMode;
  operationId: string;
  seq: number;
  eventType: SearchSessionEventType;
  accepted: boolean;
  reason: string;
  phase: string;
  payload: SearchSessionEventPayload;
};

type ActiveOperationTuple = {
  mode: ShadowMode;
  sessionId: string;
  operationId: string;
  requestId: number;
  seq: number;
};

type HandleSearchResponseRuntimeShadow = {
  runtimeTuple: ActiveOperationTuple;
  emitShadowTransition: (
    eventType: SearchSessionEventType,
    payload?: SearchSessionEventPayload
  ) => boolean;
};

type SubmitSearchOptions = {
  openNow?: boolean;
  priceLevels?: number[] | null;
  minimumVotes?: number | null;
  page?: number;
  append?: boolean;
  preserveSheetState?: boolean;
  transitionFromDockedPolls?: boolean;
  forceFreshBounds?: boolean;
  scoreMode?: NaturalSearchRequest['scoreMode'];
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
  isLoadingMore: boolean;
  setIsLoadingMore: React.Dispatch<React.SetStateAction<boolean>>;
  results: SearchResponse | null;
  setResults: React.Dispatch<React.SetStateAction<SearchResponse | null>>;
  submittedQuery: string;
  setSubmittedQuery: React.Dispatch<React.SetStateAction<string>>;
  preferredActiveTab: SegmentValue;
  setActiveTab: React.Dispatch<React.SetStateAction<SegmentValue>>;
  hasActiveTabPreference: boolean;
  scoreMode: NaturalSearchRequest['scoreMode'];
  setHasMoreFood: React.Dispatch<React.SetStateAction<boolean>>;
  setHasMoreRestaurants: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  isPaginationExhausted: boolean;
  setIsPaginationExhausted: React.Dispatch<React.SetStateAction<boolean>>;
  canLoadMore: boolean;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  onSearchRequestLoadingChange?: (isLoading: boolean) => void;
  setIsSearchSessionActive: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchMode: React.Dispatch<React.SetStateAction<SearchMode>>;
  showPanel: () => void;
  resetSheetToHidden: () => void;
  scrollResultsToTop: () => void;
  isSearchEditingRef?: React.MutableRefObject<boolean>;
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
  isRestaurantOverlayVisibleRef?: React.MutableRefObject<boolean>;
  prepareShortcutSheetTransition?: () => boolean;
  onPageOneResultsCommitted?: () => void;
  onShortcutSearchCoverageSnapshot?: (snapshot: {
    searchRequestId: string;
    bounds: MapBounds | null;
    entities: StructuredSearchRequest['entities'];
  }) => void;
  runtimeSessionController: SearchSessionController;
  onRuntimeMechanismEvent?: RuntimeMechanismEmitter;
  onSearchSessionShadowTransition?: (transition: SearchSessionShadowTransition) => void;
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
    options?: {
      preserveSheetState?: boolean;
      transitionFromDockedPolls?: boolean;
      filters?: StructuredSearchFilters;
      forceFreshBounds?: boolean;
      scoreMode?: NaturalSearchRequest['scoreMode'];
    }
  ) => Promise<void>;
  rerunActiveSearch: (params: {
    searchMode: SearchMode;
    activeTab: SegmentValue;
    submittedQuery: string;
    query: string;
    isSearchSessionActive: boolean;
    preserveSheetState?: boolean;
  }) => Promise<void>;
  loadMoreResults: (searchMode: SearchMode) => void;
  cancelActiveSearchRequest: () => void;
};

type SubmitUiLanesOptions = {
  requestId: number;
  mode: SearchMode;
  targetTab: SegmentValue;
  preserveSheetState: boolean;
  transitionFromDockedPolls: boolean;
  shouldHoldResultPanel: boolean;
  shouldResetPagination: boolean;
  submittedLabel?: string;
};

const resolveIntentDefaultTab = (response: SearchResponse): SegmentValue | null => {
  const filters = [
    ...(response.plan?.restaurantFilters ?? []),
    ...(response.plan?.connectionFilters ?? []),
  ];
  const hasRestaurantAttributeFilter = filters.some(
    (filter) =>
      filter.entityType === 'restaurant_attribute' &&
      Array.isArray(filter.entityIds) &&
      filter.entityIds.length > 0
  );
  if (hasRestaurantAttributeFilter) {
    return 'restaurants';
  }

  const hasFoodFilter = filters.some(
    (filter) =>
      filter.entityType === 'food' && Array.isArray(filter.entityIds) && filter.entityIds.length > 0
  );
  if (hasFoodFilter) {
    return 'dishes';
  }

  return null;
};

const resolveSubmissionDefaultTab = (
  submissionContext: NaturalSearchRequest['submissionContext']
): SegmentValue | null => {
  const contextRecord =
    submissionContext && typeof submissionContext === 'object' && !Array.isArray(submissionContext)
      ? (submissionContext as Record<string, unknown>)
      : null;
  const selectedEntityType = contextRecord?.selectedEntityType;
  if (selectedEntityType === 'restaurant' || selectedEntityType === 'restaurant_attribute') {
    return 'restaurants';
  }
  if (selectedEntityType === 'food') {
    return 'dishes';
  }
  return null;
};

const resolveResponsePage = (response: SearchResponse, targetPage: number): number => {
  const page = response.metadata?.page;
  if (typeof page === 'number' && Number.isFinite(page) && page > 0) {
    return page;
  }
  return targetPage;
};

const normalizeSearchResponse = (
  response: SearchResponse,
  targetPage: number,
  fallbackSearchRequestId?: string
): SearchResponse => {
  const normalizedPage = resolveResponsePage(response, targetPage);
  const hasSearchRequestId =
    typeof response.metadata?.searchRequestId === 'string' &&
    response.metadata.searchRequestId.length > 0;
  const normalizedSearchRequestId = hasSearchRequestId
    ? response.metadata.searchRequestId
    : fallbackSearchRequestId;

  const shouldPatchPage = normalizedPage !== response.metadata?.page;
  const shouldPatchSearchRequestId =
    typeof normalizedSearchRequestId === 'string' &&
    normalizedSearchRequestId.length > 0 &&
    normalizedSearchRequestId !== response.metadata?.searchRequestId;

  if (!shouldPatchPage && !shouldPatchSearchRequestId) {
    return response;
  }

  return {
    ...response,
    metadata: {
      ...response.metadata,
      page: normalizedPage,
      ...(shouldPatchSearchRequestId ? { searchRequestId: normalizedSearchRequestId } : {}),
    },
  };
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

const isRateLimitError = (error: unknown) => {
  if (error && typeof error === 'object') {
    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeCode === 'string' && maybeCode === 'RATE_LIMITED') {
      return true;
    }
  }

  if (axios.isAxiosError(error)) {
    return error.response?.status === 429;
  }

  return false;
};

const shouldPreclearNaturalResults = false;
const shouldPrimeSubmittedQueryBeforeResponse = false;

const useSearchSubmit = ({
  query,
  isLoadingMore,
  setIsLoadingMore,
  results,
  setResults,
  submittedQuery,
  setSubmittedQuery,
  preferredActiveTab,
  setActiveTab,
  hasActiveTabPreference,
  scoreMode,
  setHasMoreFood,
  setHasMoreRestaurants,
  currentPage,
  setCurrentPage,
  isPaginationExhausted,
  setIsPaginationExhausted,
  canLoadMore,
  setError,
  onSearchRequestLoadingChange,
  setIsSearchSessionActive,
  setSearchMode,
  showPanel,
  resetSheetToHidden,
  scrollResultsToTop,
  isSearchEditingRef,
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
  isRestaurantOverlayVisibleRef,
  prepareShortcutSheetTransition,
  onPageOneResultsCommitted,
  onShortcutSearchCoverageSnapshot,
  runtimeSessionController,
  onRuntimeMechanismEvent,
  onSearchSessionShadowTransition,
}: UseSearchSubmitOptions): UseSearchSubmitResult => {
  const searchRequestSeqRef = React.useRef(0);
  const activeSearchRequestRef = React.useRef(0);
  const shortcutBoundsSnapshotRef = React.useRef<MapBounds | null>(null);
  const shortcutSearchRequestIdRef = React.useRef<string | null>(null);
  const loadingMoreTokenSeqRef = React.useRef(0);
  const activeLoadingMoreTokenRef = React.useRef<number | null>(null);
  const isSearchRequestInFlightRef = React.useRef(false);
  const responseApplyTokenRef = React.useRef(0);
  const isMountedRef = React.useRef(true);
  const shouldLogSearchResponsePayload = searchPerfDebug.logSearchResponsePayload;
  const shouldLogSearchResponseTimings =
    searchPerfDebug.enabled && searchPerfDebug.logSearchResponseTimings;
  const searchResponseTimingMinMs = searchPerfDebug.logSearchResponseTimingMinMs;
  const phaseStartRef = React.useRef<number | null>(null);
  const runtimeShadowSessionIdRef = React.useRef(
    `search-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
  const activeOperationTupleRef = React.useRef<ActiveOperationTuple | null>(null);
  const hasReportedCutoverRef = React.useRef(false);
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
  const resolveShadowOperationId = React.useCallback(
    (mode: ShadowMode, requestId: number): string => {
      if (mode === 'natural') {
        return getNaturalShadowOperationId(requestId);
      }
      if (mode === 'entity') {
        return getEntityShadowOperationId(requestId);
      }
      return getShortcutShadowOperationId(requestId);
    },
    []
  );
  const createActiveOperationTuple = React.useCallback(
    (mode: ShadowMode, requestId: number): ActiveOperationTuple => ({
      mode,
      sessionId: runtimeShadowSessionIdRef.current,
      operationId: resolveShadowOperationId(mode, requestId),
      requestId,
      seq: 0,
    }),
    [resolveShadowOperationId]
  );
  const clearActiveOperationTuple = React.useCallback((tuple: ActiveOperationTuple) => {
    const activeTuple = activeOperationTupleRef.current;
    if (!activeTuple) {
      return;
    }
    if (activeTuple.operationId !== tuple.operationId) {
      return;
    }
    activeOperationTupleRef.current = null;
  }, []);
  const emitShadowTransitionForTuple = React.useCallback(
    (
      tuple: ActiveOperationTuple,
      eventType: SearchSessionEventType,
      payload: SearchSessionEventPayload = {}
    ): boolean => {
      const activeTuple = activeOperationTupleRef.current;
      if (!activeTuple || activeTuple.operationId !== tuple.operationId) {
        return false;
      }
      tuple.seq += 1;
      const nextSeq = tuple.seq;
      const atMs = getPerfNow();
      const event =
        tuple.mode === 'natural'
          ? createNaturalShadowEvent({
              sessionId: tuple.sessionId,
              requestId: tuple.requestId,
              seq: nextSeq,
              atMs,
              type: eventType,
              payload,
            })
          : tuple.mode === 'entity'
          ? createEntityShadowEvent({
              sessionId: tuple.sessionId,
              requestId: tuple.requestId,
              seq: nextSeq,
              atMs,
              type: eventType,
              payload,
            })
          : createShortcutShadowEvent({
              sessionId: tuple.sessionId,
              requestId: tuple.requestId,
              seq: nextSeq,
              atMs,
              type: eventType,
              payload,
            });
      const result = runtimeSessionController.dispatch(event);
      onRuntimeMechanismEvent?.('runtime_write_span', {
        domain: 'search_session_shadow',
        label: 'shadow_transition',
        mode: tuple.mode,
        operationId: tuple.operationId,
        eventType,
        seq: nextSeq,
        accepted: result.accepted,
        reason: result.reason,
        phase: result.state.phase,
      });
      onSearchSessionShadowTransition?.({
        mode: tuple.mode,
        operationId: tuple.operationId,
        seq: nextSeq,
        eventType,
        accepted: result.accepted,
        reason: result.reason,
        phase: result.state.phase,
        payload,
      });
      if (!result.accepted) {
        return false;
      }
      return true;
    },
    [onRuntimeMechanismEvent, onSearchSessionShadowTransition, runtimeSessionController]
  );
  const activateRuntimeShadowOperation = React.useCallback(
    (tuple: ActiveOperationTuple, submitPayload: SearchSessionEventPayload): boolean => {
      activeOperationTupleRef.current = tuple;
      if (!emitShadowTransitionForTuple(tuple, 'submit_intent', submitPayload)) {
        return false;
      }
      return emitShadowTransitionForTuple(tuple, 'submitting', {
        mode: tuple.mode,
      });
    },
    [emitShadowTransitionForTuple]
  );
  const createHandleSearchResponseRuntimeShadow = React.useCallback(
    (runtimeTuple: ActiveOperationTuple): HandleSearchResponseRuntimeShadow => ({
      runtimeTuple,
      emitShadowTransition: (eventType, payload) =>
        emitShadowTransitionForTuple(runtimeTuple, eventType, payload ?? {}),
    }),
    [emitShadowTransitionForTuple]
  );
  const scheduleOnNextFrame = React.useCallback((run: () => void) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        run();
      });
      return;
    }
    setTimeout(() => {
      run();
    }, 0);
  }, []);
  const scheduleAfterTwoFrames = React.useCallback(
    (run: () => void) => {
      scheduleOnNextFrame(() => {
        scheduleOnNextFrame(run);
      });
    },
    [scheduleOnNextFrame]
  );
  const runNonCriticalStateUpdate = React.useCallback((run: () => void) => {
    if (typeof React.startTransition === 'function') {
      React.startTransition(() => {
        run();
      });
      return;
    }
    run();
  }, []);
  const isRequestStillActive = React.useCallback(
    (requestId: number) => isMountedRef.current && activeSearchRequestRef.current === requestId,
    []
  );
  const scheduleSubmitUiLanes = React.useCallback(
    (options: SubmitUiLanesOptions) => {
      const {
        requestId,
        mode,
        targetTab,
        preserveSheetState,
        transitionFromDockedPolls,
        shouldHoldResultPanel,
        shouldResetPagination,
        submittedLabel,
      } = options;
      const shouldRevealPanel = !preserveSheetState && !shouldHoldResultPanel;

      scheduleOnNextFrame(() => {
        if (!isRequestStillActive(requestId)) {
          return;
        }
        if (transitionFromDockedPolls && !shouldHoldResultPanel) {
          prepareShortcutSheetTransition?.();
        }
        if (submittedLabel && !preserveSheetState) {
          setSubmittedQuery(submittedLabel);
        }
        if (shouldRevealPanel) {
          showPanel();
        }
      });

      scheduleAfterTwoFrames(() => {
        if (!isRequestStillActive(requestId)) {
          return;
        }
        unstable_batchedUpdates(() => {
          setSearchMode(mode);
          setIsSearchSessionActive(true);
          setActiveTab(targetTab);
          setIsLoadingMore(false);
          lastAutoOpenKeyRef.current = null;
          activeLoadingMoreTokenRef.current = null;
        });
        if (shouldResetPagination) {
          runNonCriticalStateUpdate(() => {
            setHasMoreFood(false);
            setHasMoreRestaurants(false);
            setIsPaginationExhausted(false);
            setCurrentPage(1);
          });
        }
      });
    },
    [
      isRequestStillActive,
      lastAutoOpenKeyRef,
      prepareShortcutSheetTransition,
      runNonCriticalStateUpdate,
      scheduleAfterTwoFrames,
      scheduleOnNextFrame,
      setActiveTab,
      setCurrentPage,
      setHasMoreFood,
      setHasMoreRestaurants,
      setIsLoadingMore,
      setIsPaginationExhausted,
      setIsSearchSessionActive,
      setSearchMode,
      setSubmittedQuery,
      showPanel,
    ]
  );

  React.useEffect(() => {
    if (!shouldLogSearchResponseTimings) {
      return;
    }
    // eslint-disable-next-line no-console
    console.log('[SearchPerf] response timing logs enabled');
  }, [shouldLogSearchResponseTimings]);
  React.useEffect(
    () => () => {
      isMountedRef.current = false;
      responseApplyTokenRef.current += 1;
      const activeTuple = activeOperationTupleRef.current;
      if (activeTuple) {
        emitShadowTransitionForTuple(activeTuple, 'cancelled', {
          reason: 'hook_unmount',
        });
        clearActiveOperationTuple(activeTuple);
      }
      isSearchRequestInFlightRef.current = false;
      onSearchRequestLoadingChange?.(false);
    },
    [clearActiveOperationTuple, emitShadowTransitionForTuple, onSearchRequestLoadingChange]
  );
  React.useEffect(() => {
    if (hasReportedCutoverRef.current) {
      return;
    }
    hasReportedCutoverRef.current = true;
    logger.debug('Search runtime submit controller cutover', {
      naturalControllerCutover: true,
    });
  }, []);

  const beginLoadingMore = React.useCallback(() => {
    const token = ++loadingMoreTokenSeqRef.current;
    activeLoadingMoreTokenRef.current = token;
    setIsLoadingMore(true);
    return token;
  }, [setIsLoadingMore]);

  const endLoadingMore = React.useCallback(
    (token: number) => {
      if (activeLoadingMoreTokenRef.current !== token) {
        return;
      }
      activeLoadingMoreTokenRef.current = null;
      setIsLoadingMore(false);
    },
    [setIsLoadingMore]
  );

  const cancelActiveSearchRequest = React.useCallback(() => {
    cancelSearch();
    const activeTuple = activeOperationTupleRef.current;
    if (activeTuple) {
      emitShadowTransitionForTuple(activeTuple, 'cancelled', {
        reason: 'cancel_active_search_request',
      });
      clearActiveOperationTuple(activeTuple);
    }
    activeSearchRequestRef.current = ++searchRequestSeqRef.current;
    responseApplyTokenRef.current += 1;
    isSearchRequestInFlightRef.current = false;
    onSearchRequestLoadingChange?.(false);
    unstable_batchedUpdates(() => {
      setIsLoadingMore(false);
    });
    activeLoadingMoreTokenRef.current = null;
  }, [
    cancelSearch,
    clearActiveOperationTuple,
    emitShadowTransitionForTuple,
    onSearchRequestLoadingChange,
    setIsLoadingMore,
  ]);
  const setSearchRequestInFlight = React.useCallback(
    (isInFlight: boolean) => {
      if (isSearchRequestInFlightRef.current === isInFlight) {
        return;
      }
      isSearchRequestInFlightRef.current = isInFlight;
      onSearchRequestLoadingChange?.(isInFlight);
    },
    [onSearchRequestLoadingChange]
  );
  const resolveRequestBounds = React.useCallback(
    async (options: {
      shouldCaptureBounds: boolean;
      forceFreshBounds?: boolean;
      logLabel: 'natural' | 'structured';
    }): Promise<MapBounds | null> => {
      const shouldCaptureFromMap =
        options.shouldCaptureBounds &&
        (options.forceFreshBounds || !latestBoundsRef.current) &&
        mapRef.current?.getVisibleBounds;
      if (shouldCaptureFromMap) {
        const boundsStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
        try {
          const visibleBounds = await mapRef.current!.getVisibleBounds();
          if (
            Array.isArray(visibleBounds) &&
            visibleBounds.length >= 2 &&
            isLngLatTuple(visibleBounds[0]) &&
            isLngLatTuple(visibleBounds[1])
          ) {
            const nextBounds = boundsFromPairs(visibleBounds[0], visibleBounds[1]);
            latestBoundsRef.current = nextBounds;
            return nextBounds;
          }
        } catch (boundsError) {
          logger.warn(
            `Unable to determine map bounds before submitting ${options.logLabel} search`,
            {
              message: boundsError instanceof Error ? boundsError.message : 'unknown error',
            }
          );
        } finally {
          if (shouldLogSearchResponseTimings && boundsStart > 0) {
            logSearchResponseTiming(
              `getVisibleBounds:${options.logLabel}`,
              getPerfNow() - boundsStart
            );
          }
        }
      }
      return latestBoundsRef.current;
    },
    [getPerfNow, latestBoundsRef, logSearchResponseTiming, mapRef, shouldLogSearchResponseTimings]
  );

  const handleSearchResponse = React.useCallback(
    (
      response: SearchResponse,
      options: {
        append: boolean;
        targetPage: number;
        fallbackSearchRequestId?: string;
        submittedLabel?: string;
        pushToHistory?: boolean;
        submissionContext?: NaturalSearchRequest['submissionContext'];
        showPanelOnResponse?: boolean;
        responseReceivedPayload: SearchSessionEventPayload;
        runtimeShadow: HandleSearchResponseRuntimeShadow;
      }
    ) => {
      const handleStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
      const {
        append,
        targetPage,
        submittedLabel,
        pushToHistory,
        fallbackSearchRequestId,
        runtimeShadow,
      } = options;
      const { runtimeTuple } = runtimeShadow;
      const emitShadowTransition = runtimeShadow.emitShadowTransition;
      const normalizedResponse = normalizeSearchResponse(
        response,
        targetPage,
        fallbackSearchRequestId
      );
      const responseApplyToken = responseApplyTokenRef.current + 1;
      responseApplyTokenRef.current = responseApplyToken;
      const isResponseApplyStale = () =>
        !isMountedRef.current || responseApplyTokenRef.current !== responseApplyToken;
      if (!emitShadowTransition('response_received', options.responseReceivedPayload)) {
        clearActiveOperationTuple(runtimeTuple);
        return;
      }

      logSearchPhase('handleSearchResponse:start');
      let previousFoodCountSnapshot = 0;
      let previousRestaurantCountSnapshot = 0;
      let mergedFoodCount = normalizedResponse.dishes?.length ?? 0;
      let mergedRestaurantCount = normalizedResponse.restaurants?.length ?? 0;

      const singleRestaurantCandidate = resolveSingleRestaurantCandidate(normalizedResponse);
      unstable_batchedUpdates(() => {
        setResults((prev) => {
          const base = append ? prev : null;
          previousFoodCountSnapshot = base?.dishes?.length ?? 0;
          previousRestaurantCountSnapshot = base?.restaurants?.length ?? 0;
          const mergeStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
          const merged = mergeSearchResponses(base, normalizedResponse, append);
          if (shouldLogSearchResponseTimings) {
            logSearchResponseTiming('mergeSearchResponses', getPerfNow() - mergeStart);
          }
          mergedFoodCount = merged.dishes?.length ?? 0;
          mergedRestaurantCount = merged.restaurants?.length ?? 0;
          return merged;
        });
      });
      logSearchPhase('handleSearchResponse:results-committed');
      if (
        !emitShadowTransition('phase_a_committed', {
          append,
          targetPage,
          requestId: normalizedResponse.metadata.searchRequestId ?? null,
        })
      ) {
        clearActiveOperationTuple(runtimeTuple);
        return;
      }
      if (!append && normalizedResponse.metadata.page === 1) {
        scheduleOnNextFrame(() => {
          if (isResponseApplyStale()) {
            return;
          }
          onPageOneResultsCommitted?.();
        });
      }

      const applyResponseMetaState = () => {
        if (isResponseApplyStale()) {
          return;
        }
        runNonCriticalStateUpdate(() => {
          unstable_batchedUpdates(() => {
            if (!append && singleRestaurantCandidate) {
              setActiveTab('restaurants');
            } else if (!append) {
              const hasFoodResults = normalizedResponse?.dishes?.length > 0;
              const hasRestaurantsResults = (normalizedResponse?.restaurants?.length ?? 0) > 0;
              const intentDefaultTab = resolveIntentDefaultTab(normalizedResponse);

              setActiveTab((prevTab) => {
                if (!hasActiveTabPreference && intentDefaultTab) {
                  if (intentDefaultTab === 'dishes' && hasFoodResults) {
                    return 'dishes';
                  }
                  if (intentDefaultTab === 'restaurants' && hasRestaurantsResults) {
                    return 'restaurants';
                  }
                  return hasFoodResults ? 'dishes' : 'restaurants';
                }
                if (prevTab === 'dishes' && hasFoodResults) {
                  return 'dishes';
                }
                if (prevTab === 'restaurants' && hasRestaurantsResults) {
                  return 'restaurants';
                }
                return hasFoodResults ? 'dishes' : 'restaurants';
              });
            }

            if (!singleRestaurantCandidate) {
              const totalFoodAvailable =
                normalizedResponse.metadata.totalFoodResults ?? mergedFoodCount;
              const totalRestaurantAvailable =
                normalizedResponse.metadata.totalRestaurantResults ?? mergedRestaurantCount;

              const nextHasMoreFood = mergedFoodCount < totalFoodAvailable;
              const nextHasMoreRestaurants =
                normalizedResponse.format === 'dual_list'
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
        });
        logSearchPhase('handleSearchResponse:meta-applied');
      };
      if (append) {
        applyResponseMetaState();
      } else {
        scheduleOnNextFrame(() => {
          if (isResponseApplyStale()) {
            return;
          }
          applyResponseMetaState();
        });
      }
      if (!append) {
        scheduleOnNextFrame(() => {
          if (isResponseApplyStale()) {
            return;
          }
          scheduleOnNextFrame(() => {
            if (isResponseApplyStale()) {
              return;
            }
            runNonCriticalStateUpdate(() => {
              unstable_batchedUpdates(() => {
                lastSearchRequestIdRef.current =
                  normalizedResponse.metadata.searchRequestId ?? null;
                if (submittedLabel) {
                  setSubmittedQuery(submittedLabel);
                } else {
                  setSubmittedQuery('');
                }

                setIsPaginationExhausted(false);

                if (singleRestaurantCandidate) {
                  if (!isRestaurantOverlayVisibleRef?.current) {
                    resetSheetToHidden();
                  }
                } else if (options.showPanelOnResponse) {
                  showPanel();
                }
              });
            });
            logSearchPhase('handleSearchResponse:ui-deferred');
          });
        });
      }

      if (!append && submittedLabel && pushToHistory) {
        const hasEntityTargets = [
          ...(normalizedResponse.plan?.restaurantFilters ?? []),
          ...(normalizedResponse.plan?.connectionFilters ?? []),
        ].some((filter) => Array.isArray(filter.entityIds) && filter.entityIds.length > 0);

        const enqueueHistoryUpdate = () => {
          if (isResponseApplyStale()) {
            return;
          }
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
        if (isResponseApplyStale()) {
          clearActiveOperationTuple(runtimeTuple);
          return;
        }
        if (!isSearchEditingRef?.current) {
          Keyboard.dismiss();
          scrollResultsToTop();
        }
      }
      const finalizeShadowTransitions = () => {
        if (isResponseApplyStale()) {
          clearActiveOperationTuple(runtimeTuple);
          return;
        }
        if (
          !emitShadowTransition('visual_released', {
            append,
            targetPage,
            requestId: normalizedResponse.metadata.searchRequestId ?? null,
          })
        ) {
          clearActiveOperationTuple(runtimeTuple);
          return;
        }
        scheduleOnNextFrame(() => {
          if (isResponseApplyStale()) {
            clearActiveOperationTuple(runtimeTuple);
            return;
          }
          if (
            !emitShadowTransition('phase_b_materializing', {
              append,
              targetPage,
              requestId: normalizedResponse.metadata.searchRequestId ?? null,
            })
          ) {
            clearActiveOperationTuple(runtimeTuple);
            return;
          }
          scheduleOnNextFrame(() => {
            if (isResponseApplyStale()) {
              clearActiveOperationTuple(runtimeTuple);
              return;
            }
            emitShadowTransition('settled', {
              append,
              targetPage,
              requestId: normalizedResponse.metadata.searchRequestId ?? null,
            });
            clearActiveOperationTuple(runtimeTuple);
            logSearchPhase('handleSearchResponse:done');
            if (shouldLogSearchResponseTimings) {
              logSearchResponseTiming('handleSearchResponse', getPerfNow() - handleStart);
            }
          });
        });
      };
      if (append) {
        finalizeShadowTransitions();
      } else {
        scheduleOnNextFrame(finalizeShadowTransitions);
      }
    },
    [
      lastSearchRequestIdRef,
      loadRecentHistory,
      logSearchPhase,
      hasActiveTabPreference,
      isRestaurantOverlayVisibleRef,
      clearActiveOperationTuple,
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
      scheduleOnNextFrame,
      runNonCriticalStateUpdate,
      updateLocalRecentSearches,
      isSearchEditingRef,
      onPageOneResultsCommitted,
    ]
  );

  const buildStructuredSearchPayload = React.useCallback(
    async (
      page: number,
      filters: StructuredSearchFilters = {},
      scoreModeOverride?: NaturalSearchRequest['scoreMode'],
      options?: {
        forceFreshBounds?: boolean;
      }
    ): Promise<StructuredSearchRequest> => {
      const buildStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
      const pagination = { page, pageSize: DEFAULT_PAGE_SIZE };
      const payload: StructuredSearchRequest = {
        entities: {},
        pagination,
        includeSqlPreview: false,
        scoreMode: scoreModeOverride ?? scoreMode,
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

      const bounds = await resolveRequestBounds({
        shouldCaptureBounds: page === 1,
        forceFreshBounds: options?.forceFreshBounds,
        logLabel: 'structured',
      });
      if (bounds) {
        payload.bounds = bounds;
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
      logSearchResponseTiming,
      openNow,
      priceLevels,
      resolveRequestBounds,
      scoreMode,
      shouldLogSearchResponseTimings,
      userLocationRef,
      votes100Plus,
    ]
  );

  const submitSearch = React.useCallback(
    async (options?: SubmitSearchOptions, overrideQuery?: string) => {
      const append = Boolean(options?.append);
      if (append && (isSearchRequestInFlightRef.current || isLoadingMore)) {
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
      const naturalTuple = createActiveOperationTuple('natural', requestId);
      const naturalShadowActivated = activateRuntimeShadowOperation(
        naturalTuple,
        createNaturalSubmitIntentPayload({
          query: trimmed,
          targetPage,
          append,
          submissionSource: options?.submission?.source ?? 'manual',
        })
      );
      if (!naturalShadowActivated) {
        clearActiveOperationTuple(naturalTuple);
        return;
      }

      let preserveSheetState = false;
      if (!append) {
        preserveSheetState = Boolean(options?.preserveSheetState);
        const transitionFromDockedPolls =
          !preserveSheetState && Boolean(options?.transitionFromDockedPolls);
        const submissionContextTab = resolveSubmissionDefaultTab(options?.submission?.context);
        const preRequestTab =
          submissionContextTab ?? (hasActiveTabPreference ? preferredActiveTab : DEFAULT_SEGMENT);
        const shouldHoldRestaurantOverlaySheet = isRestaurantOverlayVisibleRef?.current === true;
        scheduleSubmitUiLanes({
          requestId,
          mode: 'natural',
          targetTab: preRequestTab,
          preserveSheetState,
          transitionFromDockedPolls,
          shouldHoldResultPanel: shouldHoldRestaurantOverlaySheet,
          shouldResetPagination: false,
        });
        activeLoadingMoreTokenRef.current = null;
        logSearchPhase('submitSearch:ui-lanes-scheduled');
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

      let loadingMoreToken: number | null = null;
      let didStartResponseLifecycle = false;
      const shouldForceFreshBounds = Boolean(options?.forceFreshBounds);
      try {
        if (append) {
          loadingMoreToken = beginLoadingMore();
          logSearchPhase('submitSearch:loading-more');
        } else {
          setSearchRequestInFlight(true);
          setError(null);
          if (shouldPreclearNaturalResults) {
            setResults(null);
          }
          if (shouldPrimeSubmittedQueryBeforeResponse && !preserveSheetState) {
            setSubmittedQuery(trimmed);
          }
          logSearchPhase('submitSearch:loading-state');
        }

        const payload: NaturalSearchRequest = {
          query: trimmed,
          pagination: { page: targetPage, pageSize: DEFAULT_PAGE_SIZE },
          includeSqlPreview: false,
          scoreMode: options?.scoreMode ?? scoreMode,
        };
        if (append && lastSearchRequestIdRef.current) {
          payload.searchRequestId = lastSearchRequestIdRef.current;
        }

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

        const bounds = await resolveRequestBounds({
          shouldCaptureBounds: !append,
          forceFreshBounds: shouldForceFreshBounds,
          logLabel: 'natural',
        });
        if (bounds) {
          payload.bounds = bounds;
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
          didStartResponseLifecycle = true;
          useSystemStatusStore.getState().clearServiceIssue('search');
          logSearchResponsePayload('Search response', response, shouldLogSearchResponsePayload);
          const submittedLabel = append ? undefined : trimmed;
          handleSearchResponse(response, {
            append,
            targetPage,
            fallbackSearchRequestId: append ? undefined : `natural:${requestId}`,
            submittedLabel,
            pushToHistory: !append,
            submissionContext: options?.submission?.context,
            showPanelOnResponse: false,
            responseReceivedPayload: createNaturalResponseReceivedPayload(response, targetPage),
            runtimeShadow: createHandleSearchResponseRuntimeShadow(naturalTuple),
          });
        }
      } catch (err) {
        logger.error('Search request failed', { message: (err as Error).message });
        if (requestId === activeSearchRequestRef.current) {
          emitShadowTransitionForTuple(naturalTuple, 'error', {
            mode: 'natural',
            append,
            targetPage,
            message: err instanceof Error ? err.message : 'unknown error',
          });
          clearActiveOperationTuple(naturalTuple);
          if (!append) {
            setError(null);
          } else {
            setError(
              isRateLimitError(err)
                ? 'Too many requests. Please wait a moment and try again.'
                : 'Unable to load more results. Please try again.'
            );
          }
        }
      } finally {
        if (append) {
          if (loadingMoreToken != null) {
            endLoadingMore(loadingMoreToken);
          }
        } else if (requestId === activeSearchRequestRef.current) {
          setSearchRequestInFlight(false);
        }
        if (requestId === activeSearchRequestRef.current) {
          const activeTuple = activeOperationTupleRef.current;
          if (
            activeTuple &&
            activeTuple.operationId === naturalTuple.operationId &&
            !didStartResponseLifecycle
          ) {
            emitShadowTransitionForTuple(naturalTuple, 'cancelled', {
              mode: 'natural',
              append,
              targetPage,
              reason: 'natural_finalized_without_response_lifecycle',
            });
            clearActiveOperationTuple(naturalTuple);
          }
        }
      }
    },
    [
      beginLoadingMore,
      clearActiveOperationTuple,
      createActiveOperationTuple,
      createHandleSearchResponseRuntimeShadow,
      ensureUserLocation,
      endLoadingMore,
      emitShadowTransitionForTuple,
      preferredActiveTab,
      handleSearchResponse,
      isLoadingMore,
      hasActiveTabPreference,
      isRestaurantOverlayVisibleRef,
      logSearchPhase,
      resolveRequestBounds,
      shouldLogSearchResponsePayload,
      openNow,
      priceLevels,
      scoreMode,
      query,
      resetMapMoveFlag,
      runSearch,
      activateRuntimeShadowOperation,
      scheduleSubmitUiLanes,
      setError,
      setResults,
      setSearchRequestInFlight,
      setSubmittedQuery,
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
      const trimmedName = params.restaurantName.trim();
      if (!trimmedName) {
        return;
      }
      const requestId = ++searchRequestSeqRef.current;
      activeSearchRequestRef.current = requestId;
      const entityTuple = createActiveOperationTuple('entity', requestId);
      const entityShadowActivated = activateRuntimeShadowOperation(
        entityTuple,
        createEntitySubmitIntentPayload({
          restaurantId: params.restaurantId,
          restaurantName: trimmedName,
          preserveSheetState: Boolean(params.preserveSheetState),
        })
      );
      if (!entityShadowActivated) {
        clearActiveOperationTuple(entityTuple);
        return;
      }

      resetMapMoveFlag();
      const preserveSheetState = Boolean(params.preserveSheetState);
      const shouldHoldRestaurantOverlaySheet = isRestaurantOverlayVisibleRef?.current === true;
      scheduleSubmitUiLanes({
        requestId,
        mode: 'natural',
        targetTab: 'restaurants',
        preserveSheetState,
        transitionFromDockedPolls: false,
        shouldHoldResultPanel: shouldHoldRestaurantOverlaySheet,
        shouldResetPagination: true,
        submittedLabel: trimmedName,
      });
      setError(null);
      Keyboard.dismiss();
      logSearchPhase('runRestaurantEntitySearch:ui-lanes-scheduled');

      let didStartResponseLifecycle = false;
      try {
        if (isLoadingMore) {
          setIsLoadingMore(false);
        }
        setSearchRequestInFlight(true);
        logSearchPhase('runRestaurantEntitySearch:loading-state');
        const payload = await buildStructuredSearchPayload(
          1,
          {
            openNow: false,
            priceLevels: [],
            minimumVotes: 0,
          },
          undefined,
          {
            forceFreshBounds: false,
          }
        );
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
          didStartResponseLifecycle = true;
          logSearchResponsePayload(
            'Structured restaurant search response',
            response,
            shouldLogSearchResponsePayload
          );
          handleSearchResponse(response, {
            append: false,
            targetPage: 1,
            fallbackSearchRequestId: `restaurant-entity:${requestId}`,
            submittedLabel: trimmedName,
            pushToHistory: true,
            submissionContext,
            showPanelOnResponse: false,
            responseReceivedPayload: createEntityResponseReceivedPayload(response),
            runtimeShadow: createHandleSearchResponseRuntimeShadow(entityTuple),
          });
        }
      } catch (err) {
        logger.error('Structured restaurant search failed', {
          message: err instanceof Error ? err.message : 'unknown error',
        });
        if (requestId === activeSearchRequestRef.current) {
          emitShadowTransitionForTuple(entityTuple, 'error', {
            mode: 'entity',
            message: err instanceof Error ? err.message : 'unknown error',
          });
          clearActiveOperationTuple(entityTuple);
          setError(null);
        }
      } finally {
        if (requestId === activeSearchRequestRef.current) {
          setSearchRequestInFlight(false);
          const activeTuple = activeOperationTupleRef.current;
          if (
            activeTuple &&
            activeTuple.operationId === entityTuple.operationId &&
            !didStartResponseLifecycle
          ) {
            emitShadowTransitionForTuple(entityTuple, 'cancelled', {
              mode: 'entity',
              reason: 'entity_finalized_without_response_lifecycle',
            });
            clearActiveOperationTuple(entityTuple);
          }
        }
      }
    },
    [
      buildStructuredSearchPayload,
      clearActiveOperationTuple,
      createActiveOperationTuple,
      createHandleSearchResponseRuntimeShadow,
      emitShadowTransitionForTuple,
      handleSearchResponse,
      isLoadingMore,
      logSearchPhase,
      logSearchResponseTiming,
      shouldLogSearchResponseTimings,
      getPerfNow,
      searchResponseTimingMinMs,
      scheduleSubmitUiLanes,
      shouldLogSearchResponsePayload,
      resetMapMoveFlag,
      runSearch,
      activateRuntimeShadowOperation,
      setError,
      setIsLoadingMore,
      setSearchRequestInFlight,
      isRestaurantOverlayVisibleRef,
    ]
  );

  const runBestHere = React.useCallback(
    async (
      targetTab: SegmentValue,
      submittedLabel: string,
      options?: {
        preserveSheetState?: boolean;
        transitionFromDockedPolls?: boolean;
        filters?: StructuredSearchFilters;
        forceFreshBounds?: boolean;
        scoreMode?: NaturalSearchRequest['scoreMode'];
      }
    ) => {
      logSearchPhase('runBestHere:start', { reset: true });
      const requestId = ++searchRequestSeqRef.current;
      activeSearchRequestRef.current = requestId;
      const shortcutTuple = createActiveOperationTuple('shortcut', requestId);
      const shortcutShadowActivated = activateRuntimeShadowOperation(
        shortcutTuple,
        createShortcutSubmitIntentPayload({
          targetTab,
          submittedLabel,
          preserveSheetState: Boolean(options?.preserveSheetState),
          targetPage: 1,
          append: false,
        })
      );
      if (!shortcutShadowActivated) {
        clearActiveOperationTuple(shortcutTuple);
        return;
      }
      const shouldForceFreshBounds = Boolean(options?.forceFreshBounds);

      resetMapMoveFlag();
      const preserveSheetState = Boolean(options?.preserveSheetState);
      const transitionFromDockedPolls =
        !preserveSheetState && Boolean(options?.transitionFromDockedPolls);
      scheduleSubmitUiLanes({
        requestId,
        mode: 'shortcut',
        targetTab,
        preserveSheetState,
        transitionFromDockedPolls,
        shouldHoldResultPanel: false,
        shouldResetPagination: true,
        submittedLabel,
      });
      setError(null);
      Keyboard.dismiss();
      logSearchPhase('runBestHere:ui-lanes-scheduled');

      let didStartResponseLifecycle = false;
      try {
        setSearchRequestInFlight(true);
        shortcutSearchRequestIdRef.current = null;
        if (isLoadingMore) {
          setIsLoadingMore(false);
          logSearchPhase('runBestHere:loading-more');
        }
        logSearchPhase('runBestHere:loading-state');
        const payload = await buildStructuredSearchPayload(
          1,
          options?.filters,
          options?.scoreMode,
          {
            forceFreshBounds: shouldForceFreshBounds,
          }
        );
        shortcutBoundsSnapshotRef.current = payload.bounds ?? null;
        const shortcutCoverageSnapshot = {
          bounds: payload.bounds ?? null,
          entities: payload.entities,
        };
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
          didStartResponseLifecycle = true;
          const responseSearchRequestId = response?.metadata?.searchRequestId ?? null;
          if (responseSearchRequestId && onShortcutSearchCoverageSnapshot) {
            shortcutSearchRequestIdRef.current = responseSearchRequestId;
            onShortcutSearchCoverageSnapshot({
              searchRequestId: responseSearchRequestId,
              ...shortcutCoverageSnapshot,
            });
          }
          logSearchResponsePayload(
            'Structured search response',
            response,
            shouldLogSearchResponsePayload
          );
          handleSearchResponse(response, {
            append: false,
            targetPage: 1,
            fallbackSearchRequestId: `shortcut:${requestId}`,
            submittedLabel,
            pushToHistory: false,
            showPanelOnResponse: false,
            responseReceivedPayload: createShortcutResponseReceivedPayload(response),
            runtimeShadow: createHandleSearchResponseRuntimeShadow(shortcutTuple),
          });
        }
      } catch (err) {
        logger.error('Best here request failed', {
          message: err instanceof Error ? err.message : 'unknown error',
        });
        if (requestId === activeSearchRequestRef.current) {
          emitShadowTransitionForTuple(shortcutTuple, 'error', {
            mode: 'shortcut',
            message: err instanceof Error ? err.message : 'unknown error',
          });
          clearActiveOperationTuple(shortcutTuple);
          setError(null);
        }
      } finally {
        if (requestId === activeSearchRequestRef.current) {
          setSearchRequestInFlight(false);
          const activeTuple = activeOperationTupleRef.current;
          if (
            activeTuple &&
            activeTuple.operationId === shortcutTuple.operationId &&
            !didStartResponseLifecycle
          ) {
            emitShadowTransitionForTuple(shortcutTuple, 'cancelled', {
              mode: 'shortcut',
              reason: 'shortcut_finalized_without_response_lifecycle',
            });
            clearActiveOperationTuple(shortcutTuple);
          }
        }
      }
    },
    [
      buildStructuredSearchPayload,
      clearActiveOperationTuple,
      createActiveOperationTuple,
      createHandleSearchResponseRuntimeShadow,
      emitShadowTransitionForTuple,
      handleSearchResponse,
      isLoadingMore,
      logSearchPhase,
      logSearchResponseTiming,
      shouldLogSearchResponsePayload,
      shouldLogSearchResponseTimings,
      getPerfNow,
      searchResponseTimingMinMs,
      resetMapMoveFlag,
      runSearch,
      activateRuntimeShadowOperation,
      scheduleSubmitUiLanes,
      setError,
      setIsLoadingMore,
      setSearchRequestInFlight,
      onShortcutSearchCoverageSnapshot,
    ]
  );

  const loadMoreShortcutResults = React.useCallback(() => {
    if (
      isSearchRequestInFlightRef.current ||
      isLoadingMore ||
      !results ||
      !canLoadMore ||
      isPaginationExhausted
    ) {
      return;
    }

    const nextPage = currentPage + 1;
    const loadingMoreToken = beginLoadingMore();
    const requestId = ++searchRequestSeqRef.current;
    activeSearchRequestRef.current = requestId;
    const shortcutAppendTuple = createActiveOperationTuple('shortcut', requestId);
    const shortcutAppendShadowActivated = activateRuntimeShadowOperation(
      shortcutAppendTuple,
      createShortcutSubmitIntentPayload({
        targetTab: preferredActiveTab,
        submittedLabel: submittedQuery || 'Best dishes here',
        preserveSheetState: true,
        targetPage: nextPage,
        append: true,
      })
    );
    if (!shortcutAppendShadowActivated) {
      clearActiveOperationTuple(shortcutAppendTuple);
      endLoadingMore(loadingMoreToken);
      return;
    }

    const run = async () => {
      let didStartResponseLifecycle = false;
      try {
        const payload = await buildStructuredSearchPayload(nextPage);
        if (shortcutBoundsSnapshotRef.current) {
          payload.bounds = shortcutBoundsSnapshotRef.current;
        }
        if (shortcutSearchRequestIdRef.current) {
          payload.searchRequestId = shortcutSearchRequestIdRef.current;
        }
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
        if (response && requestId === activeSearchRequestRef.current) {
          didStartResponseLifecycle = true;
          logSearchResponsePayload(
            'Structured search pagination',
            response,
            shouldLogSearchResponsePayload
          );
          handleSearchResponse(response, {
            append: true,
            targetPage: nextPage,
            fallbackSearchRequestId: undefined,
            submittedLabel: submittedQuery || 'Best dishes here',
            pushToHistory: false,
            showPanelOnResponse: false,
            responseReceivedPayload: createShortcutResponseReceivedPayload(response),
            runtimeShadow: createHandleSearchResponseRuntimeShadow(shortcutAppendTuple),
          });
        }
      } catch (err) {
        logger.error('Best dishes here pagination failed', {
          message: err instanceof Error ? err.message : 'unknown error',
        });
        emitShadowTransitionForTuple(shortcutAppendTuple, 'error', {
          mode: 'shortcut',
          append: true,
          targetPage: nextPage,
          message: err instanceof Error ? err.message : 'unknown error',
        });
        clearActiveOperationTuple(shortcutAppendTuple);
        setError(
          isRateLimitError(err)
            ? 'Too many requests. Please wait a moment and try again.'
            : 'Unable to load more results. Please try again.'
        );
      } finally {
        endLoadingMore(loadingMoreToken);
        if (requestId === activeSearchRequestRef.current) {
          const activeTuple = activeOperationTupleRef.current;
          if (
            activeTuple &&
            activeTuple.operationId === shortcutAppendTuple.operationId &&
            !didStartResponseLifecycle
          ) {
            emitShadowTransitionForTuple(shortcutAppendTuple, 'cancelled', {
              mode: 'shortcut',
              append: true,
              targetPage: nextPage,
              reason: 'append_finalized_without_response_lifecycle',
            });
            clearActiveOperationTuple(shortcutAppendTuple);
          }
        }
      }
    };

    void run();
  }, [
    beginLoadingMore,
    buildStructuredSearchPayload,
    canLoadMore,
    clearActiveOperationTuple,
    currentPage,
    createActiveOperationTuple,
    createHandleSearchResponseRuntimeShadow,
    endLoadingMore,
    emitShadowTransitionForTuple,
    getPerfNow,
    handleSearchResponse,
    isLoadingMore,
    isPaginationExhausted,
    logSearchResponseTiming,
    preferredActiveTab,
    results,
    runSearch,
    activateRuntimeShadowOperation,
    searchResponseTimingMinMs,
    setError,
    shouldLogSearchResponsePayload,
    shouldLogSearchResponseTimings,
    submittedQuery,
  ]);

  const loadMoreResults = React.useCallback(
    (searchMode: SearchMode) => {
      if (
        isSearchRequestInFlightRef.current ||
        isLoadingMore ||
        !results ||
        !canLoadMore ||
        isPaginationExhausted
      ) {
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
      isLoadingMore,
      isPaginationExhausted,
      loadMoreShortcutResults,
      query,
      results,
      submittedQuery,
      submitSearch,
    ]
  );
  const rerunActiveSearch = React.useCallback(
    async (params: {
      searchMode: SearchMode;
      activeTab: SegmentValue;
      submittedQuery: string;
      query: string;
      isSearchSessionActive: boolean;
      preserveSheetState?: boolean;
    }) => {
      const rerunQuery = (params.submittedQuery || params.query).trim();
      if (!rerunQuery) {
        return;
      }
      if (params.searchMode === 'shortcut' && params.isSearchSessionActive) {
        const fallbackShortcutLabel =
          params.activeTab === 'restaurants' ? 'Best restaurants' : 'Best dishes';
        const submittedLabel = params.submittedQuery.trim() || fallbackShortcutLabel;
        await runBestHere(params.activeTab, submittedLabel, {
          preserveSheetState: params.preserveSheetState,
          forceFreshBounds: true,
        });
        return;
      }
      await submitSearch(
        {
          preserveSheetState: params.preserveSheetState,
          forceFreshBounds: true,
        },
        rerunQuery
      );
    },
    [runBestHere, submitSearch]
  );

  return {
    submitSearch,
    runRestaurantEntitySearch,
    runBestHere,
    rerunActiveSearch,
    loadMoreResults,
    cancelActiveSearchRequest,
  };
};

export default useSearchSubmit;
