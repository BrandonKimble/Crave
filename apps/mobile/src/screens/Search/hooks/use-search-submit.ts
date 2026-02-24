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
import type { RuntimeWorkScheduler } from '../runtime/scheduler/runtime-work-scheduler';
import type {
  SearchRuntimeBus,
  SearchRuntimeBusState,
  SearchRuntimeOperationLane,
} from '../runtime/shared/search-runtime-bus';
import { computeMarkerPipeline } from '../runtime/map/compute-marker-pipeline';
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
  preferredActiveTab: SegmentValue;
  setActiveTab: React.Dispatch<React.SetStateAction<SegmentValue>>;
  hasActiveTabPreference: boolean;
  scoreMode: NaturalSearchRequest['scoreMode'];
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  onSearchRequestLoadingChange?: (isLoading: boolean) => void;
  runtimeWorkSchedulerRef?: React.MutableRefObject<RuntimeWorkScheduler> | null;
  searchRuntimeBus: SearchRuntimeBus;
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

type BufferedSearchResponse = {
  response: SearchResponse;
  options: {
    append: boolean;
    targetPage: number;
    initialUiState: InitialResultUiState;
    fallbackSearchRequestId?: string;
    submittedLabel?: string;
    pushToHistory?: boolean;
    submissionContext?: NaturalSearchRequest['submissionContext'];
    showPanelOnResponse?: boolean;
    responseReceivedPayload: SearchSessionEventPayload;
    runtimeShadow: HandleSearchResponseRuntimeShadow;
  };
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
  onSlideTransitionComplete: () => void;
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

type InitialResultUiState = {
  mode: SearchMode;
  targetTab: SegmentValue;
};

type SearchOperationLaneSchedulingOptions = {
  requestId: number;
  requiredHealthyFrames: number;
  maxWaitMs: number;
  onReady: () => void;
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

const shouldPreclearNaturalResults = true;
const shouldPrimeSubmittedQueryBeforeResponse = true;

const useSearchSubmit = ({
  query,
  preferredActiveTab,
  setActiveTab,
  hasActiveTabPreference,
  scoreMode,
  setError,
  onSearchRequestLoadingChange,
  runtimeWorkSchedulerRef,
  searchRuntimeBus,
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
  // Response buffering: delays response processing until sheet slide completes
  const slideTransitionPendingRef = React.useRef(false);
  const slideTransitionMaxWaitRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferedResponseRef = React.useRef<BufferedSearchResponse | null>(null);
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
  const publishRuntimeLaneState = React.useCallback(
    (
      tuple: ActiveOperationTuple | null,
      lane: SearchRuntimeOperationLane,
      patch?: Partial<SearchRuntimeBusState>
    ) => {
      const laneResetPatch: Partial<SearchRuntimeBusState> =
        lane === 'idle'
          ? {
              isVisualSyncPending: false,
              visualSyncCandidateRequestKey: null,
              visualReadyRequestKey: null,
              markerRevealCommitId: null,
              pendingTabSwitchTab: null,
              pendingTabSwitchRequestKey: null,
            }
          : {};
      searchRuntimeBus.publish({
        activeOperationId: tuple?.operationId ?? null,
        activeOperationLane: lane,
        ...laneResetPatch,
        ...(patch ?? {}),
      });
    },
    [searchRuntimeBus]
  );
  const activateRuntimeShadowOperation = React.useCallback(
    (tuple: ActiveOperationTuple, submitPayload: SearchSessionEventPayload): boolean => {
      activeOperationTupleRef.current = tuple;
      if (!emitShadowTransitionForTuple(tuple, 'submit_intent', submitPayload)) {
        return false;
      }
      const submittingAccepted = emitShadowTransitionForTuple(tuple, 'submitting', {
        mode: tuple.mode,
      });
      if (submittingAccepted) {
        publishRuntimeLaneState(tuple, 'lane_a_ack');
      }
      return submittingAccepted;
    },
    [emitShadowTransitionForTuple, publishRuntimeLaneState]
  );
  const createHandleSearchResponseRuntimeShadow = React.useCallback(
    (runtimeTuple: ActiveOperationTuple): HandleSearchResponseRuntimeShadow => ({
      runtimeTuple,
      emitShadowTransition: (eventType, payload) =>
        emitShadowTransitionForTuple(runtimeTuple, eventType, payload ?? {}),
    }),
    [emitShadowTransitionForTuple]
  );
  const scheduleAfterHealthyFrames = React.useCallback(
    ({
      requestId,
      requiredHealthyFrames,
      maxWaitMs,
      onReady,
    }: SearchOperationLaneSchedulingOptions) => {
      const minHealthyFrames = Math.max(1, requiredHealthyFrames);
      const waitCapMs = Math.max(16, maxWaitMs);
      let healthyFrameCount = 0;
      let lastFrameAtMs = getPerfNow();
      let lastYieldCount = runtimeWorkSchedulerRef?.current?.snapshotPressure().yieldCount ?? 0;
      const startedAtMs = lastFrameAtMs;

      const tick = () => {
        if (!isRequestStillActive(requestId)) {
          return;
        }
        const nowMs = getPerfNow();
        const frameDeltaMs = Math.max(0, nowMs - lastFrameAtMs);
        lastFrameAtMs = nowMs;

        const pressure = runtimeWorkSchedulerRef?.current?.snapshotPressure() ?? null;
        const nextYieldCount = pressure?.yieldCount ?? lastYieldCount;
        const yieldDelta = Math.max(0, nextYieldCount - lastYieldCount);
        lastYieldCount = nextYieldCount;
        const queueDepth = pressure?.queueDepth ?? 0;
        const lastFrameSpentMs = pressure?.lastFrameSpentMs ?? 0;
        const isHealthyFrame =
          frameDeltaMs <= 24 && lastFrameSpentMs <= 8 && queueDepth <= 1 && yieldDelta === 0;

        healthyFrameCount = isHealthyFrame ? healthyFrameCount + 1 : 0;
        if (healthyFrameCount >= minHealthyFrames || nowMs - startedAtMs >= waitCapMs) {
          onReady();
          return;
        }

        scheduleOnNextFrame(tick);
      };

      scheduleOnNextFrame(tick);
    },
    [isRequestStillActive, runtimeWorkSchedulerRef, scheduleOnNextFrame]
  );
  const scheduleAfterResultsHydrationSettled = React.useCallback(
    ({
      requestId,
      maxWaitMs,
      expectedRequestKey,
      onReady,
    }: {
      requestId: number;
      maxWaitMs: number;
      expectedRequestKey?: string | null;
      onReady: () => void;
    }) => {
      const waitCapMs = Math.max(16, maxWaitMs);
      const startedAtMs = getPerfNow();

      const tick = () => {
        if (!isRequestStillActive(requestId)) {
          return;
        }
        const runtimeState = searchRuntimeBus?.getState();
        const runtimeRequestKey = runtimeState?.results?.metadata?.searchRequestId ?? null;
        const hasExpectedRequest =
          expectedRequestKey == null || runtimeRequestKey === expectedRequestKey;
        const isHydrationSettled =
          hasExpectedRequest && (runtimeState?.isResultsHydrationSettled ?? true);
        const shouldHydrateResultsForRender = runtimeState?.shouldHydrateResultsForRender ?? false;
        if (isHydrationSettled && !shouldHydrateResultsForRender) {
          onReady();
          return;
        }
        const nowMs = getPerfNow();
        if (nowMs - startedAtMs >= waitCapMs) {
          onReady();
          return;
        }
        scheduleOnNextFrame(tick);
      };

      scheduleOnNextFrame(tick);
    },
    [getPerfNow, isRequestStillActive, scheduleOnNextFrame, searchRuntimeBus]
  );
  const scheduleAfterRuntimeSettleContract = React.useCallback(
    ({
      requestId,
      expectedOperationId,
      maxWaitMs,
      onReady,
    }: {
      requestId: number;
      expectedOperationId: string;
      maxWaitMs: number;
      onReady: () => void;
    }) => {
      const waitCapMs = Math.max(16, maxWaitMs);
      const startedAtMs = getPerfNow();

      const tick = () => {
        if (!isRequestStillActive(requestId)) {
          return;
        }
        const runtimeState = searchRuntimeBus?.getState();
        const runtimeOperationId = runtimeState?.activeOperationId ?? null;
        if (runtimeOperationId != null && runtimeOperationId !== expectedOperationId) {
          return;
        }
        const laneIdle = (runtimeState?.activeOperationLane ?? 'idle') === 'idle';
        // Note: hydration settlement is NOT checked here because
        // scheduleAfterResultsHydrationSettled already gates the chain entry, and
        // the handoff phase (h3_hydration_ramp) intentionally blocks further
        // hydration commits via allowHydrationFinalizeCommit — creating a circular
        // dependency if we waited for hydration here.
        const visualSettled = !(runtimeState?.isVisualSyncPending ?? false);
        const schedulerQueueDepth =
          runtimeWorkSchedulerRef?.current.snapshotPressure().queueDepth ?? 0;
        const schedulerQuiet = schedulerQueueDepth <= 0;
        if (laneIdle && visualSettled && schedulerQuiet) {
          onReady();
          return;
        }
        const nowMs = getPerfNow();
        if (nowMs - startedAtMs >= waitCapMs) {
          onReady();
          return;
        }
        scheduleOnNextFrame(tick);
      };

      scheduleOnNextFrame(tick);
    },
    [
      getPerfNow,
      isRequestStillActive,
      runtimeWorkSchedulerRef,
      scheduleOnNextFrame,
      searchRuntimeBus,
    ]
  );
  const flushBufferedResponseRef = React.useRef<() => void>(() => undefined);
  const clearSlideTransitionPendingRef = React.useRef<() => void>(() => undefined);
  const scheduleSubmitUiLanes = React.useCallback(
    (options: SubmitUiLanesOptions) => {
      const {
        targetTab,
        preserveSheetState,
        transitionFromDockedPolls,
        shouldHoldResultPanel,
        shouldResetPagination,
        submittedLabel,
      } = options;
      const shouldRevealPanel = !preserveSheetState && !shouldHoldResultPanel;
      // Keep submit UX immediate: do not buffer response application behind
      // sheet transition completion.
      if (shouldRevealPanel) {
        bufferedResponseRef.current = null;
        slideTransitionPendingRef.current = false;
      }
      const activeTuple = activeOperationTupleRef.current;
      searchRuntimeBus.batch(() => {
        publishRuntimeLaneState(activeTuple, 'lane_a_ack', {
          isMapActivationDeferred: true,
        });
      });

      // Execute submit UI lanes synchronously (no frame deferral) so sheet
      // slides up and loading cover shows on the same frame as submit.
      if (transitionFromDockedPolls && !shouldHoldResultPanel) {
        prepareShortcutSheetTransition?.();
      }
      unstable_batchedUpdates(() => {
        if (shouldRevealPanel) {
          showPanel();
        }
        lastAutoOpenKeyRef.current = null;
        activeLoadingMoreTokenRef.current = null;
      });
      searchRuntimeBus.batch(() => {
        const laneAStatePatch: Partial<SearchRuntimeBusState> = {
          activeTab: targetTab,
          pendingTabSwitchTab: null,
          pendingTabSwitchRequestKey: null,
          isLoadingMore: false,
          submittedQuery: submittedLabel ?? searchRuntimeBus.getState().submittedQuery ?? '',
          isVisualSyncPending: false,
          visualSyncCandidateRequestKey: null,
          visualReadyRequestKey: null,
          markerRevealCommitId: null,
        };
        publishRuntimeLaneState(activeOperationTupleRef.current, 'lane_a_ack', laneAStatePatch);
      });
      setActiveTab(targetTab);

      if (shouldResetPagination) {
        scheduleAfterTwoFrames(() => {
          runNonCriticalStateUpdate(() => {
            searchRuntimeBus.publish({
              hasMoreFood: false,
              hasMoreRestaurants: false,
              isPaginationExhausted: false,
              currentPage: 1,
            });
          });
        });
      }
    },
    [
      lastAutoOpenKeyRef,
      prepareShortcutSheetTransition,
      publishRuntimeLaneState,
      runNonCriticalStateUpdate,
      scheduleAfterTwoFrames,
      setActiveTab,
      showPanel,
      searchRuntimeBus,
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
      clearSlideTransitionPendingRef.current();
      bufferedResponseRef.current = null;
      const activeTuple = activeOperationTupleRef.current;
      if (activeTuple) {
        emitShadowTransitionForTuple(activeTuple, 'cancelled', {
          reason: 'hook_unmount',
        });
        clearActiveOperationTuple(activeTuple);
      }
      isSearchRequestInFlightRef.current = false;
      onSearchRequestLoadingChange?.(false);
      publishRuntimeLaneState(null, 'idle', {
        isSearchLoading: false,
        isMapActivationDeferred: false,
        activeOperationId: null,
      });
    },
    [
      clearActiveOperationTuple,
      emitShadowTransitionForTuple,
      onSearchRequestLoadingChange,
      publishRuntimeLaneState,
    ]
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

  // handleSearchResponse ref — allows flushBufferedResponse to call it
  // without creating a circular dependency in useCallback deps
  const handleSearchResponseRef = React.useRef<
    ((response: SearchResponse, options: BufferedSearchResponse['options']) => void) | null
  >(null);

  const clearSlideTransitionPending = React.useCallback(() => {
    slideTransitionPendingRef.current = false;
    if (slideTransitionMaxWaitRef.current != null) {
      clearTimeout(slideTransitionMaxWaitRef.current);
      slideTransitionMaxWaitRef.current = null;
    }
  }, []);

  const flushBufferedResponse = React.useCallback(() => {
    clearSlideTransitionPending();
    const buffered = bufferedResponseRef.current;
    if (!buffered) {
      return;
    }
    bufferedResponseRef.current = null;
    handleSearchResponseRef.current?.(buffered.response, buffered.options);
  }, [clearSlideTransitionPending]);
  clearSlideTransitionPendingRef.current = clearSlideTransitionPending;
  flushBufferedResponseRef.current = flushBufferedResponse;

  const onSlideTransitionComplete = React.useCallback(() => {
    if (!slideTransitionPendingRef.current) {
      return;
    }
    flushBufferedResponse();
  }, [flushBufferedResponse]);

  const beginLoadingMore = React.useCallback(() => {
    const token = ++loadingMoreTokenSeqRef.current;
    activeLoadingMoreTokenRef.current = token;
    searchRuntimeBus.publish({ isLoadingMore: true });
    return token;
  }, [searchRuntimeBus]);

  const endLoadingMore = React.useCallback(
    (token: number) => {
      if (activeLoadingMoreTokenRef.current !== token) {
        return;
      }
      activeLoadingMoreTokenRef.current = null;
      searchRuntimeBus.publish({ isLoadingMore: false });
    },
    [searchRuntimeBus]
  );

  const cancelActiveSearchRequest = React.useCallback(() => {
    cancelSearch();
    // Clear any buffered response on cancellation
    clearSlideTransitionPending();
    bufferedResponseRef.current = null;
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
    searchRuntimeBus.batch(() => {
      publishRuntimeLaneState(activeTuple, 'idle', {
        isSearchLoading: false,
        isMapActivationDeferred: false,
        activeOperationId: null,
      });
      searchRuntimeBus.publish({ isLoadingMore: false });
    });
    activeLoadingMoreTokenRef.current = null;
  }, [
    cancelSearch,
    clearActiveOperationTuple,
    clearSlideTransitionPending,
    emitShadowTransitionForTuple,
    onSearchRequestLoadingChange,
    publishRuntimeLaneState,
    searchRuntimeBus,
  ]);
  const setSearchRequestInFlight = React.useCallback(
    (isInFlight: boolean) => {
      if (isSearchRequestInFlightRef.current === isInFlight) {
        return;
      }
      isSearchRequestInFlightRef.current = isInFlight;
      onSearchRequestLoadingChange?.(isInFlight);
      searchRuntimeBus.publish({
        isSearchLoading: isInFlight,
      });
    },
    [onSearchRequestLoadingChange, searchRuntimeBus]
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
        initialUiState: InitialResultUiState;
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
        initialUiState,
        submittedLabel,
        pushToHistory,
        fallbackSearchRequestId,
        runtimeShadow,
      } = options;
      const { runtimeTuple } = runtimeShadow;
      const emitShadowTransition = runtimeShadow.emitShadowTransition;
      const appendFallbackSearchRequestId = append
        ? searchRuntimeBus.getState().results?.metadata?.searchRequestId ?? undefined
        : undefined;
      const normalizedResponse = normalizeSearchResponse(
        response,
        targetPage,
        fallbackSearchRequestId ?? appendFallbackSearchRequestId
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
      {
        const base = append ? searchRuntimeBus.getState().results : null;
        previousFoodCountSnapshot = base?.dishes?.length ?? 0;
        previousRestaurantCountSnapshot = base?.restaurants?.length ?? 0;
        const mergeStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
        const merged = mergeSearchResponses(base, normalizedResponse, append);
        if (shouldLogSearchResponseTimings) {
          logSearchResponseTiming('mergeSearchResponses', getPerfNow() - mergeStart);
        }
        const mergedSearchRequestId =
          merged.metadata?.searchRequestId ??
          normalizedResponse.metadata.searchRequestId ??
          normalizedResponse.metadata.requestId ??
          `${runtimeTuple.mode}:${runtimeTuple.requestId}`;
        const mergedForPublish =
          typeof mergedSearchRequestId === 'string' &&
          mergedSearchRequestId.length > 0 &&
          merged.metadata?.searchRequestId !== mergedSearchRequestId
            ? {
                ...merged,
                metadata: {
                  ...merged.metadata,
                  searchRequestId: mergedSearchRequestId,
                },
              }
            : merged;
        mergedFoodCount = merged.dishes?.length ?? 0;
        mergedRestaurantCount = merged.restaurants?.length ?? 0;
        // Pre-compute marker catalog off the render path.
        // Keep it fresh for both first-page and append responses so map/list projections do not drift.
        const searchRequestId =
          mergedForPublish.metadata.searchRequestId ??
          normalizedResponse.metadata.searchRequestId ??
          normalizedResponse.metadata.requestId ??
          `${runtimeTuple.mode}:${runtimeTuple.requestId}`;
        const runtimeStateForPipeline = append ? searchRuntimeBus.getState() : null;
        const markerPipelineActiveTab =
          (append
            ? runtimeStateForPipeline?.pendingTabSwitchTab ?? runtimeStateForPipeline?.activeTab
            : initialUiState.targetTab) ?? 'dishes';
        const pipelineResult = computeMarkerPipeline({
          restaurants: mergedForPublish.restaurants ?? [],
          dishes: mergedForPublish.dishes ?? [],
          activeTab: markerPipelineActiveTab as 'dishes' | 'restaurants',
          scoreMode: scoreMode ?? 'global_quality',
          restaurantOnlyId: null,
          selectedRestaurantId: null,
          bounds: latestBoundsRef.current,
          userLocation: userLocationRef.current,
          searchRequestId,
        });
        searchRuntimeBus.batch(() => {
          searchRuntimeBus.publish({
            results: mergedForPublish,
            resultsRequestKey: searchRequestId || null,
            precomputedMarkerCatalog: pipelineResult.catalog,
            precomputedMarkerPrimaryCount: pipelineResult.primaryCount,
            precomputedCanonicalRestaurantRankById: pipelineResult.canonicalRestaurantRankById,
            precomputedRestaurantsById: pipelineResult.restaurantsById,
            precomputedMarkerResultsKey: pipelineResult.resultsKey,
            precomputedMarkerActiveTab: markerPipelineActiveTab as 'dishes' | 'restaurants',
          });
        });
      }
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
      searchRuntimeBus.batch(() => {
        publishRuntimeLaneState(runtimeTuple, 'lane_b_data_commit', {
          searchMode: initialUiState.mode,
          isSearchSessionActive: true,
          activeTab: initialUiState.targetTab,
          pendingTabSwitchTab: null,
          pendingTabSwitchRequestKey: null,
        });
      });
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
            searchRuntimeBus.batch(() => {
              let resolvedActiveTab: 'dishes' | 'restaurants' | null = null;
              if (!append && (runtimeTuple.mode === 'shortcut' || runtimeTuple.mode === 'entity')) {
                setActiveTab(initialUiState.targetTab);
                resolvedActiveTab = initialUiState.targetTab as 'dishes' | 'restaurants';
              }
              if (!append && singleRestaurantCandidate && runtimeTuple.mode !== 'shortcut') {
                setActiveTab('restaurants');
                resolvedActiveTab = 'restaurants';
              } else if (!append && runtimeTuple.mode === 'natural') {
                const hasFoodResults = normalizedResponse?.dishes?.length > 0;
                const hasRestaurantsResults = (normalizedResponse?.restaurants?.length ?? 0) > 0;
                const submissionDefaultTab = resolveSubmissionDefaultTab(options.submissionContext);
                const intentDefaultTab = submissionDefaultTab ?? resolveIntentDefaultTab(normalizedResponse);

                const computeTab = (prevTab: 'dishes' | 'restaurants') => {
                  if (intentDefaultTab) {
                    if (intentDefaultTab === 'dishes' && hasFoodResults) {
                      return 'dishes' as const;
                    }
                    if (intentDefaultTab === 'restaurants' && hasRestaurantsResults) {
                      return 'restaurants' as const;
                    }
                  }
                  if (!hasFoodResults && !hasRestaurantsResults) {
                    return prevTab;
                  }
                  if (prevTab === 'dishes' && hasFoodResults) {
                    return 'dishes' as const;
                  }
                  if (prevTab === 'restaurants' && hasRestaurantsResults) {
                    return 'restaurants' as const;
                  }
                  return (hasFoodResults ? 'dishes' : 'restaurants') as 'dishes' | 'restaurants';
                };
                setActiveTab(computeTab);
                const busActiveTab = searchRuntimeBus?.getState().activeTab ?? 'dishes';
                resolvedActiveTab = computeTab(busActiveTab);
              }
              if (resolvedActiveTab != null) {
                searchRuntimeBus.publish({
                  activeTab: resolvedActiveTab,
                  pendingTabSwitchTab: null,
                  pendingTabSwitchRequestKey: null,
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

                const nextIsPaginationExhausted =
                  append &&
                  (!(
                    mergedFoodCount > previousFoodCountSnapshot ||
                    mergedRestaurantCount > previousRestaurantCountSnapshot
                  ) ||
                    (!nextHasMoreFood && !nextHasMoreRestaurants));

                const currentIsPaginationExhausted =
                  nextIsPaginationExhausted ||
                  (!append ? false : searchRuntimeBus.getState().isPaginationExhausted);
                const nextCanLoadMore =
                  !currentIsPaginationExhausted && (nextHasMoreFood || nextHasMoreRestaurants);
                searchRuntimeBus.publish({
                  hasMoreFood: nextHasMoreFood,
                  hasMoreRestaurants: nextHasMoreRestaurants,
                  currentPage: targetPage,
                  isPaginationExhausted: currentIsPaginationExhausted,
                  canLoadMore: nextCanLoadMore,
                });
              }
            });
          });
        });
        logSearchPhase('handleSearchResponse:meta-applied');
      };
      if (append) {
        publishRuntimeLaneState(runtimeTuple, 'lane_c_list_first_paint');
        applyResponseMetaState();
      } else {
        scheduleOnNextFrame(() => {
          if (isResponseApplyStale()) {
            return;
          }
          publishRuntimeLaneState(runtimeTuple, 'lane_c_list_first_paint');
          applyResponseMetaState();
        });
      }
      if (!append) {
        scheduleOnNextFrame(() => {
          if (isResponseApplyStale()) {
            return;
          }
          runNonCriticalStateUpdate(() => {
            unstable_batchedUpdates(() => {
              searchRuntimeBus.batch(() => {
                lastSearchRequestIdRef.current =
                  normalizedResponse.metadata.searchRequestId ?? null;
                const nextSubmittedQuery = submittedLabel || '';

                searchRuntimeBus.publish({
                  submittedQuery: nextSubmittedQuery,
                  isPaginationExhausted: false,
                });

                if (singleRestaurantCandidate) {
                  if (!isRestaurantOverlayVisibleRef?.current) {
                    resetSheetToHidden();
                  }
                } else if (options.showPanelOnResponse) {
                  showPanel();
                }
              });
            });
          });
          logSearchPhase('handleSearchResponse:ui-deferred');
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

      if (!append && !isSearchEditingRef?.current) {
        Keyboard.dismiss();
        scrollResultsToTop();
      }
      const finalizeShadowTransitions = () => {
        if (isResponseApplyStale()) {
          clearActiveOperationTuple(runtimeTuple);
          return;
        }
        const responseRequestId = normalizedResponse.metadata.searchRequestId ?? null;
        const finishSettled = () => {
          if (isResponseApplyStale()) {
            clearActiveOperationTuple(runtimeTuple);
            return;
          }
          emitShadowTransition('settled', {
            append,
            targetPage,
            requestId: responseRequestId,
          });
          clearActiveOperationTuple(runtimeTuple);
          logSearchPhase('handleSearchResponse:done');
          if (shouldLogSearchResponseTimings) {
            logSearchResponseTiming('handleSearchResponse', getPerfNow() - handleStart);
          }
        };

        const emitPhaseBMaterializing = () => {
          if (isResponseApplyStale()) {
            clearActiveOperationTuple(runtimeTuple);
            return;
          }
          if (
            !emitShadowTransition('phase_b_materializing', {
              append,
              targetPage,
              requestId: responseRequestId,
            })
          ) {
            clearActiveOperationTuple(runtimeTuple);
            return;
          }
          publishRuntimeLaneState(runtimeTuple, 'lane_e_map_pins');
          scheduleAfterRuntimeSettleContract({
            requestId: runtimeTuple.requestId,
            expectedOperationId: runtimeTuple.operationId,
            maxWaitMs: 1600,
            onReady: finishSettled,
          });
        };
        const beginMapLane = () => {
          if (isResponseApplyStale()) {
            clearActiveOperationTuple(runtimeTuple);
            return;
          }
          searchRuntimeBus.batch(() => {
            publishRuntimeLaneState(runtimeTuple, 'lane_d_map_dots', {
              isMapActivationDeferred: false,
            });
          });
          if (
            !emitShadowTransition('visual_released', {
              append,
              targetPage,
              requestId: responseRequestId,
            })
          ) {
            clearActiveOperationTuple(runtimeTuple);
            return;
          }
          scheduleAfterHealthyFrames({
            requestId: runtimeTuple.requestId,
            requiredHealthyFrames: 1,
            maxWaitMs: 180,
            onReady: emitPhaseBMaterializing,
          });
        };
        if (append) {
          beginMapLane();
          return;
        }
        scheduleAfterResultsHydrationSettled({
          requestId: runtimeTuple.requestId,
          maxWaitMs: 1400,
          expectedRequestKey: responseRequestId,
          onReady: () => {
            scheduleAfterHealthyFrames({
              requestId: runtimeTuple.requestId,
              requiredHealthyFrames: 2,
              maxWaitMs: 220,
              onReady: beginMapLane,
            });
          },
        });
      };
      if (append) {
        finalizeShadowTransitions();
      } else {
        scheduleAfterHealthyFrames({
          requestId: runtimeTuple.requestId,
          requiredHealthyFrames: 1,
          maxWaitMs: 140,
          onReady: finalizeShadowTransitions,
        });
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
      searchRuntimeBus,
      showPanel,
      scheduleOnNextFrame,
      runNonCriticalStateUpdate,
      scheduleAfterHealthyFrames,
      scheduleAfterResultsHydrationSettled,
      scheduleAfterRuntimeSettleContract,
      updateLocalRecentSearches,
      isSearchEditingRef,
      onPageOneResultsCommitted,
      publishRuntimeLaneState,
    ]
  );
  handleSearchResponseRef.current = handleSearchResponse;

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
      if (
        append &&
        (isSearchRequestInFlightRef.current || searchRuntimeBus.getState().isLoadingMore)
      ) {
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
          searchRuntimeBus.publish({
            results: null,
            resultsRequestKey: null,
            submittedQuery: '',
            hasMoreFood: false,
            hasMoreRestaurants: false,
            currentPage: 1,
          });
          setError(null);
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
      const submissionContextTab = resolveSubmissionDefaultTab(options?.submission?.context);
      const preRequestTab =
        submissionContextTab ?? (hasActiveTabPreference ? preferredActiveTab : DEFAULT_SEGMENT);

      let preserveSheetState = false;
      if (!append) {
        preserveSheetState = Boolean(options?.preserveSheetState);
        const transitionFromDockedPolls =
          !preserveSheetState && Boolean(options?.transitionFromDockedPolls);
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
            searchRuntimeBus.publish({ results: null, resultsRequestKey: null });
          }
          if (shouldPrimeSubmittedQueryBeforeResponse && !preserveSheetState) {
            searchRuntimeBus.publish({ submittedQuery: trimmed });
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
            initialUiState: {
              mode: 'natural',
              targetTab: preRequestTab,
            },
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
          publishRuntimeLaneState(naturalTuple, 'idle', {
            activeOperationId: null,
            isMapActivationDeferred: false,
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
          if (!append && !didStartResponseLifecycle) {
            publishRuntimeLaneState(naturalTuple, 'idle', {
              isMapActivationDeferred: false,
              activeOperationId: null,
            });
          }
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
            publishRuntimeLaneState(naturalTuple, 'idle', {
              activeOperationId: null,
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
      searchRuntimeBus,
      setError,
      setSearchRequestInFlight,
      publishRuntimeLaneState,
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
        if (searchRuntimeBus.getState().isLoadingMore) {
          searchRuntimeBus.publish({ isLoadingMore: false });
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
            initialUiState: {
              mode: 'natural',
              targetTab: 'restaurants',
            },
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
          publishRuntimeLaneState(entityTuple, 'idle', {
            activeOperationId: null,
            isMapActivationDeferred: false,
          });
          clearActiveOperationTuple(entityTuple);
          setError(null);
        }
      } finally {
        if (requestId === activeSearchRequestRef.current) {
          setSearchRequestInFlight(false);
          if (!didStartResponseLifecycle) {
            publishRuntimeLaneState(entityTuple, 'idle', {
              isMapActivationDeferred: false,
              activeOperationId: null,
            });
          }
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
            publishRuntimeLaneState(entityTuple, 'idle', {
              activeOperationId: null,
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
      logSearchPhase,
      logSearchResponseTiming,
      shouldLogSearchResponseTimings,
      getPerfNow,
      searchRuntimeBus,
      searchResponseTimingMinMs,
      scheduleSubmitUiLanes,
      shouldLogSearchResponsePayload,
      resetMapMoveFlag,
      runSearch,
      activateRuntimeShadowOperation,
      setError,
      setSearchRequestInFlight,
      isRestaurantOverlayVisibleRef,
      publishRuntimeLaneState,
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
        if (searchRuntimeBus.getState().isLoadingMore) {
          searchRuntimeBus.publish({ isLoadingMore: false });
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
            initialUiState: {
              mode: 'shortcut',
              targetTab,
            },
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
          publishRuntimeLaneState(shortcutTuple, 'idle', {
            activeOperationId: null,
            isMapActivationDeferred: false,
          });
          clearActiveOperationTuple(shortcutTuple);
          setError(null);
        }
      } finally {
        if (requestId === activeSearchRequestRef.current) {
          setSearchRequestInFlight(false);
          if (!didStartResponseLifecycle) {
            publishRuntimeLaneState(shortcutTuple, 'idle', {
              isMapActivationDeferred: false,
              activeOperationId: null,
            });
          }
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
            publishRuntimeLaneState(shortcutTuple, 'idle', {
              activeOperationId: null,
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
      logSearchPhase,
      logSearchResponseTiming,
      shouldLogSearchResponsePayload,
      shouldLogSearchResponseTimings,
      getPerfNow,
      searchRuntimeBus,
      searchResponseTimingMinMs,
      resetMapMoveFlag,
      runSearch,
      activateRuntimeShadowOperation,
      scheduleSubmitUiLanes,
      setError,
      setSearchRequestInFlight,
      onShortcutSearchCoverageSnapshot,
      publishRuntimeLaneState,
    ]
  );

  const loadMoreShortcutResults = React.useCallback(() => {
    const busState = searchRuntimeBus.getState();
    if (
      isSearchRequestInFlightRef.current ||
      busState.isLoadingMore ||
      !busState.results ||
      !busState.canLoadMore ||
      busState.isPaginationExhausted
    ) {
      return;
    }

    const nextPage = busState.currentPage + 1;
    const busSubmittedQuery = busState.submittedQuery;
    const loadingMoreToken = beginLoadingMore();
    const requestId = ++searchRequestSeqRef.current;
    activeSearchRequestRef.current = requestId;
    const shortcutAppendTuple = createActiveOperationTuple('shortcut', requestId);
    const shortcutAppendShadowActivated = activateRuntimeShadowOperation(
      shortcutAppendTuple,
      createShortcutSubmitIntentPayload({
        targetTab: preferredActiveTab,
        submittedLabel: busSubmittedQuery || 'Best dishes here',
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
            initialUiState: {
              mode: 'shortcut',
              targetTab: preferredActiveTab,
            },
            fallbackSearchRequestId: undefined,
            submittedLabel: busSubmittedQuery || 'Best dishes here',
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
        publishRuntimeLaneState(shortcutAppendTuple, 'idle', {
          activeOperationId: null,
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
            publishRuntimeLaneState(shortcutAppendTuple, 'idle', {
              activeOperationId: null,
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
    clearActiveOperationTuple,
    createActiveOperationTuple,
    createHandleSearchResponseRuntimeShadow,
    endLoadingMore,
    emitShadowTransitionForTuple,
    getPerfNow,
    handleSearchResponse,
    logSearchResponseTiming,
    preferredActiveTab,
    runSearch,
    activateRuntimeShadowOperation,
    searchRuntimeBus,
    searchResponseTimingMinMs,
    setError,
    publishRuntimeLaneState,
    shouldLogSearchResponsePayload,
    shouldLogSearchResponseTimings,
  ]);

  const loadMoreResults = React.useCallback(
    (searchMode: SearchMode) => {
      const busState = searchRuntimeBus.getState();
      if (
        isSearchRequestInFlightRef.current ||
        busState.isLoadingMore ||
        !busState.results ||
        !busState.canLoadMore ||
        busState.isPaginationExhausted
      ) {
        return;
      }
      if (searchMode === 'shortcut') {
        loadMoreShortcutResults();
        return;
      }
      const nextPage = busState.currentPage + 1;
      const activeQuery = busState.submittedQuery || query;
      if (!activeQuery.trim()) {
        return;
      }
      void submitSearch({ page: nextPage, append: true }, activeQuery);
    },
    [loadMoreShortcutResults, query, searchRuntimeBus, submitSearch]
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
    onSlideTransitionComplete,
  };
};

export default useSearchSubmit;
