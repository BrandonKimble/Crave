import React from 'react';
import { InteractionManager, Keyboard, unstable_batchedUpdates } from 'react-native';

import type { Coordinate, MapBounds, NaturalSearchRequest, SearchResponse } from '../../../types';
import type { RecentSearch } from '../../../services/search';
import type { RuntimeWorkScheduler } from '../runtime/scheduler/runtime-work-scheduler';
import type {
  SearchSessionEventPayload,
  SearchSessionEventType,
} from '../runtime/controller/search-session-events';
import { computeMarkerPipeline } from '../runtime/map/compute-marker-pipeline';
import type { SearchRuntimeBus, SearchRuntimeBusState } from '../runtime/shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../runtime/shared/use-search-runtime-bus-selector';
import type { SegmentValue } from '../constants/search';
import { resolveSubmissionDefaultTab, type SearchMode } from './use-search-submit-entry-owner';
import { mergeSearchResponses } from '../utils/merge';
import { resolveSingleRestaurantCandidate } from '../utils/response';

export type SearchSubmitActiveOperationTuple = {
  mode: 'natural' | 'entity' | 'shortcut';
  sessionId: string;
  operationId: string;
  requestId: number;
  seq: number;
};

export type SearchSubmitHandleSearchResponseRuntimeShadow = {
  runtimeTuple: SearchSubmitActiveOperationTuple;
  emitShadowTransition: (
    eventType: SearchSessionEventType,
    payload?: SearchSessionEventPayload
  ) => boolean;
};

export type SearchSubmitInitialResultUiState = {
  mode: SearchMode;
  targetTab: SegmentValue;
};

export type SearchSubmitResponseHandlerOptions = {
  append: boolean;
  targetPage: number;
  initialUiState: SearchSubmitInitialResultUiState;
  fallbackSearchRequestId?: string;
  submittedLabel?: string;
  pushToHistory?: boolean;
  submissionContext?: NaturalSearchRequest['submissionContext'];
  requestBounds?: MapBounds | null;
  replaceResultsInPlace?: boolean;
  responseReceivedPayload: SearchSessionEventPayload;
  runtimeShadow: SearchSubmitHandleSearchResponseRuntimeShadow;
};

type SearchResponseResultsCommitPatch = Pick<
  SearchRuntimeBusState,
  | 'results'
  | 'resultsRequestKey'
  | 'precomputedMarkerCatalog'
  | 'precomputedMarkerPrimaryCount'
  | 'precomputedCanonicalRestaurantRankById'
  | 'precomputedRestaurantsById'
  | 'precomputedMarkerResultsKey'
  | 'precomputedMarkerActiveTab'
>;

type SearchResponseResultsCommitProjection = {
  committedResponse: SearchResponse;
  mergedFoodCount: number;
  mergedRestaurantCount: number;
  searchRequestId: string;
  resultsPatch: SearchResponseResultsCommitPatch;
};

type SearchResponseDeferredUiProjection = {
  searchRequestId: string;
  runtimePatch: Pick<SearchRuntimeBusState, 'submittedQuery' | 'isPaginationExhausted'>;
  shouldHideResultsSheet: boolean;
};

type SearchResponseHistoryProjection = {
  recentSearch: RecentSearchInput | null;
};

type ResultsActiveTab = 'dishes' | 'restaurants';

type SearchResponseSettleSequenceOptions = {
  tuple: SearchSubmitActiveOperationTuple;
  append: boolean;
  targetPage: number;
  responseRequestId: string;
  handleStart: number;
  isResponseApplyStale: () => boolean;
  emitShadowTransition: SearchSubmitHandleSearchResponseRuntimeShadow['emitShadowTransition'];
};

type SearchResponsePostCommitUiOptions = {
  append: boolean;
  tuple: SearchSubmitActiveOperationTuple;
  targetPage: number;
  initialTargetTab: SegmentValue;
  response: SearchResponse;
  submissionContext?: NaturalSearchRequest['submissionContext'];
  singleRestaurantCandidate: unknown;
  mergedFoodCount: number;
  mergedRestaurantCount: number;
  previousFoodCountSnapshot: number;
  previousRestaurantCountSnapshot: number;
  committedSearchRequestId: string;
  submittedLabel?: string;
  pushToHistory?: boolean;
  isResponseApplyStale: () => boolean;
};

type SearchResponsePhaseACommitOptions = {
  tuple: SearchSubmitActiveOperationTuple;
  append: boolean;
  targetPage: number;
  initialUiState: SearchSubmitInitialResultUiState;
  committedResponse: SearchResponse;
  committedSearchRequestId: string;
  requestBounds?: MapBounds | null;
  replaceResultsInPlace?: boolean;
  isResponseApplyStale: () => boolean;
  emitShadowTransition: SearchSubmitHandleSearchResponseRuntimeShadow['emitShadowTransition'];
};

type SearchResponseLifecycleContext = {
  singleRestaurantCandidate: unknown;
  previousFoodCountSnapshot: number;
  previousRestaurantCountSnapshot: number;
  mergedFoodCount: number;
  mergedRestaurantCount: number;
  committedResponse: SearchResponse;
  committedSearchRequestId: string;
  resultsPatch: SearchResponseResultsCommitPatch;
};

type SearchResponseLifecycleOptions = {
  normalizedResponse: SearchResponse;
  append: boolean;
  targetPage: number;
  initialUiState: SearchSubmitInitialResultUiState;
  submittedLabel?: string;
  pushToHistory?: boolean;
  submissionContext?: NaturalSearchRequest['submissionContext'];
  requestBounds?: MapBounds | null;
  replaceResultsInPlace?: boolean;
  runtimeTuple: SearchSubmitActiveOperationTuple;
  emitShadowTransition: SearchSubmitHandleSearchResponseRuntimeShadow['emitShadowTransition'];
  handleStart: number;
  isResponseApplyStale: () => boolean;
};

type ApplySearchResponseLifecycleContextOptions = SearchResponseLifecycleOptions & {
  responseContext: SearchResponseLifecycleContext;
};

type SearchResponseLifecycleEntry = {
  normalizedResponse: SearchResponse;
  handleStart: number;
  isResponseApplyStale: () => boolean;
  runtimeTuple: SearchSubmitActiveOperationTuple;
  emitShadowTransition: SearchSubmitHandleSearchResponseRuntimeShadow['emitShadowTransition'];
};

type RecentSearchInput = {
  queryText: string;
  selectedEntityId?: string | null;
  selectedEntityType?: RecentSearch['selectedEntityType'] | null;
  statusPreview?: RecentSearch['statusPreview'] | null;
};

type SearchOperationLaneSchedulingOptions = {
  requestId: number;
  requiredHealthyFrames: number;
  maxWaitMs: number;
  onReady: () => void;
};

type UseSearchSubmitResponseOwnerArgs = {
  activeTab: SegmentValue;
  currentResults: SearchResponse | null;
  pendingTabSwitchTab: SegmentValue | null;
  scoreMode: NaturalSearchRequest['scoreMode'];
  isPaginationExhausted: boolean;
  searchRuntimeBus: SearchRuntimeBus;
  latestBoundsRef: React.MutableRefObject<MapBounds | null>;
  userLocationRef: React.MutableRefObject<import('../../../types').Coordinate | null>;
  lastSearchRequestIdRef: React.MutableRefObject<string | null>;
  isSearchEditingRef?: React.MutableRefObject<boolean>;
  getIsProfilePresentationActive?: () => boolean;
  loadRecentHistory: (options?: { force?: boolean }) => Promise<void>;
  updateLocalRecentSearches: (value: string | RecentSearchInput) => void;
  resetSheetToHidden: () => void;
  scrollResultsToTop: () => void;
  setActiveTab: React.Dispatch<React.SetStateAction<SegmentValue>>;
  onPageOneResultsCommitted?: (payload: {
    searchRequestId: string | null;
    requestBounds: MapBounds | null;
    replaceResultsInPlace: boolean;
  }) => void;
  activeOperationTupleRef: React.MutableRefObject<SearchSubmitActiveOperationTuple | null>;
  responseApplyTokenRef: React.MutableRefObject<number>;
  isMountedRef: React.MutableRefObject<boolean>;
  clearActiveOperationTuple: (tuple: SearchSubmitActiveOperationTuple) => void;
  isRequestStillActive: (requestId: number) => boolean;
  runtimeWorkSchedulerRef?: React.MutableRefObject<RuntimeWorkScheduler> | null;
  publishRuntimeLaneState: (
    tuple: SearchSubmitActiveOperationTuple | null,
    lane: 'lane_b_data_commit' | 'lane_c_list_first_paint' | 'lane_d_map_dots' | 'lane_e_map_pins',
    patch?: Partial<SearchRuntimeBusState>
  ) => void;
  shouldLogSearchResponseTimings?: boolean;
  logSearchPhase?: (label: string, options?: { reset?: boolean }) => void;
  logSearchResponseTiming?: (label: string, durationMs: number) => void;
};

const getPerfNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
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

const resolveResponsePage = (response: SearchResponse, targetPage: number): number => {
  const page = response.metadata?.page;
  if (typeof page === 'number' && Number.isFinite(page) && page > 0) {
    return page;
  }
  return targetPage;
};

const resolveNaturalResponseActiveTab = (params: {
  response: SearchResponse;
  activeTab: ResultsActiveTab;
  submissionContext?: NaturalSearchRequest['submissionContext'];
}): ResultsActiveTab => {
  const { response, activeTab, submissionContext } = params;
  const hasFoodResults = response.dishes?.length > 0;
  const hasRestaurantsResults = (response.restaurants?.length ?? 0) > 0;
  const submissionDefaultTab = resolveSubmissionDefaultTab(submissionContext);
  const intentDefaultTab = submissionDefaultTab ?? resolveIntentDefaultTab(response);

  if (intentDefaultTab === 'dishes' && hasFoodResults) {
    return 'dishes';
  }
  if (intentDefaultTab === 'restaurants' && hasRestaurantsResults) {
    return 'restaurants';
  }
  if (!hasFoodResults && !hasRestaurantsResults) {
    return activeTab;
  }
  if (activeTab === 'dishes' && hasFoodResults) {
    return 'dishes';
  }
  if (activeTab === 'restaurants' && hasRestaurantsResults) {
    return 'restaurants';
  }
  return hasFoodResults ? 'dishes' : 'restaurants';
};

const resolveResponseActiveTab = (params: {
  append: boolean;
  activeTab: ResultsActiveTab;
  initialTargetTab: SegmentValue;
  runtimeMode: SearchSubmitActiveOperationTuple['mode'];
  response: SearchResponse;
  submissionContext?: NaturalSearchRequest['submissionContext'];
  singleRestaurantCandidate: unknown;
}): ResultsActiveTab | null => {
  const {
    append,
    activeTab,
    initialTargetTab,
    runtimeMode,
    response,
    submissionContext,
    singleRestaurantCandidate,
  } = params;

  if (append) {
    return null;
  }
  if (singleRestaurantCandidate) {
    return runtimeMode === 'shortcut' ? null : 'restaurants';
  }
  if (runtimeMode === 'shortcut' || runtimeMode === 'entity') {
    return initialTargetTab as ResultsActiveTab;
  }
  if (runtimeMode === 'natural') {
    return resolveNaturalResponseActiveTab({
      response,
      activeTab,
      submissionContext,
    });
  }
  return null;
};

const deriveResponsePaginationPatch = (params: {
  response: SearchResponse;
  append: boolean;
  targetPage: number;
  mergedFoodCount: number;
  mergedRestaurantCount: number;
  previousFoodCountSnapshot: number;
  previousRestaurantCountSnapshot: number;
  isPaginationExhausted: boolean;
}): Pick<
  SearchRuntimeBusState,
  'hasMoreFood' | 'hasMoreRestaurants' | 'currentPage' | 'isPaginationExhausted' | 'canLoadMore'
> => {
  const {
    response,
    append,
    targetPage,
    mergedFoodCount,
    mergedRestaurantCount,
    previousFoodCountSnapshot,
    previousRestaurantCountSnapshot,
    isPaginationExhausted,
  } = params;

  const totalFoodAvailable = response.metadata.totalFoodResults ?? mergedFoodCount;
  const totalRestaurantAvailable =
    response.metadata.totalRestaurantResults ?? mergedRestaurantCount;
  const nextHasMoreFood = mergedFoodCount < totalFoodAvailable;
  const nextHasMoreRestaurants =
    response.format === 'dual_list' ? mergedRestaurantCount < totalRestaurantAvailable : false;
  const nextIsPaginationExhausted =
    append &&
    (!(
      mergedFoodCount > previousFoodCountSnapshot ||
      mergedRestaurantCount > previousRestaurantCountSnapshot
    ) ||
      (!nextHasMoreFood && !nextHasMoreRestaurants));
  const currentIsPaginationExhausted =
    nextIsPaginationExhausted || (!append ? false : isPaginationExhausted);

  return {
    hasMoreFood: nextHasMoreFood,
    hasMoreRestaurants: nextHasMoreRestaurants,
    currentPage: targetPage,
    isPaginationExhausted: currentIsPaginationExhausted,
    canLoadMore: !currentIsPaginationExhausted && (nextHasMoreFood || nextHasMoreRestaurants),
  };
};

const deriveSearchResponseResultsCommitPatch = (params: {
  mergedResponse: SearchResponse;
  normalizedResponse: SearchResponse;
  runtimeMode: SearchSubmitActiveOperationTuple['mode'];
  requestId: number;
  markerPipelineActiveTab: ResultsActiveTab;
  scoreMode: NaturalSearchRequest['scoreMode'];
  bounds: MapBounds | null;
  userLocation: Coordinate | null;
}): SearchResponseResultsCommitProjection => {
  const {
    mergedResponse,
    normalizedResponse,
    runtimeMode,
    requestId,
    markerPipelineActiveTab,
    scoreMode,
    bounds,
    userLocation,
  } = params;
  const searchRequestId =
    mergedResponse.metadata?.searchRequestId ??
    normalizedResponse.metadata.searchRequestId ??
    `${runtimeMode}:${requestId}`;
  const committedResponse =
    mergedResponse.metadata?.searchRequestId === searchRequestId
      ? mergedResponse
      : {
          ...mergedResponse,
          metadata: {
            ...mergedResponse.metadata,
            searchRequestId,
          },
        };
  const mergedFoodCount = committedResponse.dishes?.length ?? 0;
  const mergedRestaurantCount = committedResponse.restaurants?.length ?? 0;
  const pipelineResult = computeMarkerPipeline({
    restaurants: committedResponse.restaurants ?? [],
    dishes: committedResponse.dishes ?? [],
    activeTab: markerPipelineActiveTab,
    scoreMode: scoreMode ?? 'global_quality',
    restaurantOnlyId: null,
    selectedRestaurantId: null,
    bounds,
    userLocation,
    searchRequestId,
  });

  return {
    committedResponse,
    mergedFoodCount,
    mergedRestaurantCount,
    searchRequestId,
    resultsPatch: {
      results: committedResponse,
      resultsRequestKey: searchRequestId,
      precomputedMarkerCatalog: pipelineResult.catalog,
      precomputedMarkerPrimaryCount: pipelineResult.primaryCount,
      precomputedCanonicalRestaurantRankById: pipelineResult.canonicalRestaurantRankById,
      precomputedRestaurantsById: pipelineResult.restaurantsById,
      precomputedMarkerResultsKey: pipelineResult.resultsKey,
      precomputedMarkerActiveTab: markerPipelineActiveTab,
    },
  };
};

const deriveSearchResponseLifecycleContext = (params: {
  baseResponse: SearchResponse | null;
  normalizedResponse: SearchResponse;
  append: boolean;
  runtimeMode: SearchSubmitActiveOperationTuple['mode'];
  requestId: number;
  initialTargetTab: SegmentValue;
  activeTab: SegmentValue;
  pendingTabSwitchTab: SegmentValue | null;
  scoreMode: NaturalSearchRequest['scoreMode'];
  bounds: MapBounds | null;
  userLocation: Coordinate | null;
}): SearchResponseLifecycleContext => {
  const merged = mergeSearchResponses(
    params.baseResponse,
    params.normalizedResponse,
    params.append
  );
  const markerPipelineActiveTab =
    (params.append ? params.pendingTabSwitchTab ?? params.activeTab : params.initialTargetTab) ??
    'dishes';
  const responseCommitProjection = deriveSearchResponseResultsCommitPatch({
    mergedResponse: merged,
    normalizedResponse: params.normalizedResponse,
    runtimeMode: params.runtimeMode,
    requestId: params.requestId,
    markerPipelineActiveTab: markerPipelineActiveTab as ResultsActiveTab,
    scoreMode: params.scoreMode,
    bounds: params.bounds,
    userLocation: params.userLocation,
  });

  return {
    singleRestaurantCandidate: resolveSingleRestaurantCandidate(params.normalizedResponse),
    previousFoodCountSnapshot: params.baseResponse?.dishes?.length ?? 0,
    previousRestaurantCountSnapshot: params.baseResponse?.restaurants?.length ?? 0,
    mergedFoodCount: responseCommitProjection.mergedFoodCount,
    mergedRestaurantCount: responseCommitProjection.mergedRestaurantCount,
    committedResponse: responseCommitProjection.committedResponse,
    committedSearchRequestId: responseCommitProjection.searchRequestId,
    resultsPatch: responseCommitProjection.resultsPatch,
  };
};

const deriveSearchResponseDeferredUiProjection = (params: {
  searchRequestId: string;
  submittedLabel?: string;
  singleRestaurantCandidate: unknown;
  isProfilePresentationActive: boolean;
}): SearchResponseDeferredUiProjection => ({
  searchRequestId: params.searchRequestId,
  runtimePatch: {
    submittedQuery: params.submittedLabel || '',
    isPaginationExhausted: false,
  },
  shouldHideResultsSheet:
    Boolean(params.singleRestaurantCandidate) && !params.isProfilePresentationActive,
});

const deriveSearchResponseHistoryProjection = (params: {
  response: SearchResponse;
  submittedLabel: string;
  submissionContext?: NaturalSearchRequest['submissionContext'];
}): SearchResponseHistoryProjection => {
  const filters = [
    ...(params.response.plan?.restaurantFilters ?? []),
    ...(params.response.plan?.connectionFilters ?? []),
  ];
  const hasEntityTargets = filters.some(
    (filter) => Array.isArray(filter.entityIds) && filter.entityIds.length > 0
  );
  if (!hasEntityTargets) {
    return {
      recentSearch: null,
    };
  }
  const contextRecord =
    params.submissionContext &&
    typeof params.submissionContext === 'object' &&
    !Array.isArray(params.submissionContext)
      ? (params.submissionContext as Record<string, unknown>)
      : null;

  return {
    recentSearch: {
      queryText: params.submittedLabel,
      selectedEntityId:
        typeof contextRecord?.selectedEntityId === 'string' ? contextRecord.selectedEntityId : null,
      selectedEntityType: contextRecord?.selectedEntityType === 'restaurant' ? 'restaurant' : null,
    },
  };
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

export const useSearchSubmitResponseOwner = ({
  activeTab,
  currentResults,
  pendingTabSwitchTab,
  scoreMode,
  isPaginationExhausted,
  searchRuntimeBus,
  latestBoundsRef,
  userLocationRef,
  lastSearchRequestIdRef,
  isSearchEditingRef,
  getIsProfilePresentationActive,
  loadRecentHistory,
  updateLocalRecentSearches,
  resetSheetToHidden,
  scrollResultsToTop,
  setActiveTab,
  onPageOneResultsCommitted,
  activeOperationTupleRef,
  responseApplyTokenRef,
  isMountedRef,
  clearActiveOperationTuple,
  isRequestStillActive,
  runtimeWorkSchedulerRef,
  publishRuntimeLaneState,
  shouldLogSearchResponseTimings = false,
  logSearchPhase = () => {},
  logSearchResponseTiming = () => {},
}: UseSearchSubmitResponseOwnerArgs) => {
  const submitRuntimeGateState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      activeOperationId: state.activeOperationId,
      activeOperationLane: state.activeOperationLane,
      resultsSearchRequestId: state.results?.metadata?.searchRequestId ?? null,
      isResultsHydrationSettled: state.isResultsHydrationSettled,
      shouldHydrateResultsForRender: state.shouldHydrateResultsForRender,
      resultsPresentation: state.resultsPresentation,
    }),
    (a, b) =>
      a.activeOperationId === b.activeOperationId &&
      a.activeOperationLane === b.activeOperationLane &&
      a.resultsSearchRequestId === b.resultsSearchRequestId &&
      a.isResultsHydrationSettled === b.isResultsHydrationSettled &&
      a.shouldHydrateResultsForRender === b.shouldHydrateResultsForRender &&
      a.resultsPresentation.isSettled === b.resultsPresentation.isSettled,
    [
      'activeOperationId',
      'activeOperationLane',
      'results',
      'isResultsHydrationSettled',
      'shouldHydrateResultsForRender',
      'resultsPresentation',
    ] as const
  );
  const submitRuntimeGateStateRef = React.useRef(submitRuntimeGateState);
  React.useEffect(() => {
    submitRuntimeGateStateRef.current = submitRuntimeGateState;
  }, [submitRuntimeGateState]);

  const scheduleOnNextFrame = React.useCallback((run: () => void) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        run();
      });
      return;
    }
    run();
  }, []);

  const runNonCriticalStateUpdate = React.useCallback((run: () => void) => {
    if (typeof React.startTransition === 'function') {
      React.startTransition(() => {
        run();
      });
      return;
    }
    run();
  }, []);

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
      expectedRequestKey: string;
      onReady: () => void;
    }) => {
      const waitCapMs = Math.max(16, maxWaitMs);
      const startedAtMs = getPerfNow();

      const tick = () => {
        if (!isRequestStillActive(requestId)) {
          return;
        }
        const runtimeState = submitRuntimeGateStateRef.current;
        const runtimeRequestKey = runtimeState.resultsSearchRequestId;
        const hasExpectedRequest = runtimeRequestKey === expectedRequestKey;
        const isHydrationSettled = hasExpectedRequest && runtimeState.isResultsHydrationSettled;
        const shouldHydrateResultsForRender = runtimeState.shouldHydrateResultsForRender;
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
    [isRequestStillActive, scheduleOnNextFrame]
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
        const runtimeState = submitRuntimeGateStateRef.current;
        const runtimeOperationId = runtimeState.activeOperationId;
        if (runtimeOperationId != null && runtimeOperationId !== expectedOperationId) {
          return;
        }
        const laneIdle = runtimeState.activeOperationLane === 'idle';
        const visualSettled = runtimeState.resultsPresentation.isSettled;
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
    [isRequestStillActive, runtimeWorkSchedulerRef, scheduleOnNextFrame]
  );

  const scheduleResponseShadowSettleSequence = React.useCallback(
    ({
      tuple,
      append,
      targetPage,
      responseRequestId,
      handleStart,
      isResponseApplyStale,
      emitShadowTransition,
    }: SearchResponseSettleSequenceOptions) => {
      const finishSettled = () => {
        if (isResponseApplyStale()) {
          clearActiveOperationTuple(tuple);
          return;
        }
        emitShadowTransition('settled', {
          append,
          targetPage,
          requestId: responseRequestId,
        });
        clearActiveOperationTuple(tuple);
        logSearchPhase('handleSearchResponse:done');
        if (shouldLogSearchResponseTimings) {
          logSearchResponseTiming('handleSearchResponse', getPerfNow() - handleStart);
        }
      };

      const emitPhaseBMaterializing = () => {
        if (isResponseApplyStale()) {
          clearActiveOperationTuple(tuple);
          return;
        }
        if (
          !emitShadowTransition('phase_b_materializing', {
            append,
            targetPage,
            requestId: responseRequestId,
          })
        ) {
          clearActiveOperationTuple(tuple);
          return;
        }
        publishRuntimeLaneState(tuple, 'lane_e_map_pins');
        scheduleAfterRuntimeSettleContract({
          requestId: tuple.requestId,
          expectedOperationId: tuple.operationId,
          maxWaitMs: 1600,
          onReady: finishSettled,
        });
      };

      const beginMapLane = () => {
        if (isResponseApplyStale()) {
          clearActiveOperationTuple(tuple);
          return;
        }
        searchRuntimeBus.batch(() => {
          publishRuntimeLaneState(tuple, 'lane_d_map_dots', {
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
          clearActiveOperationTuple(tuple);
          return;
        }
        scheduleAfterHealthyFrames({
          requestId: tuple.requestId,
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
        requestId: tuple.requestId,
        maxWaitMs: 1400,
        expectedRequestKey: responseRequestId,
        onReady: () => {
          scheduleAfterHealthyFrames({
            requestId: tuple.requestId,
            requiredHealthyFrames: 2,
            maxWaitMs: 220,
            onReady: beginMapLane,
          });
        },
      });
    },
    [
      clearActiveOperationTuple,
      logSearchPhase,
      logSearchResponseTiming,
      publishRuntimeLaneState,
      scheduleAfterHealthyFrames,
      scheduleAfterResultsHydrationSettled,
      scheduleAfterRuntimeSettleContract,
      searchRuntimeBus,
      shouldLogSearchResponseTimings,
    ]
  );

  const scheduleResponsePostCommitUiSequence = React.useCallback(
    ({
      append,
      tuple,
      targetPage,
      initialTargetTab,
      response,
      submissionContext,
      singleRestaurantCandidate,
      mergedFoodCount,
      mergedRestaurantCount,
      previousFoodCountSnapshot,
      previousRestaurantCountSnapshot,
      committedSearchRequestId,
      submittedLabel,
      pushToHistory,
      isResponseApplyStale,
    }: SearchResponsePostCommitUiOptions) => {
      const applyResponseMetaState = () => {
        if (isResponseApplyStale()) {
          return;
        }
        const resolvedActiveTab = resolveResponseActiveTab({
          append,
          activeTab,
          initialTargetTab,
          runtimeMode: tuple.mode,
          response,
          submissionContext,
          singleRestaurantCandidate,
        });
        const paginationPatch = !singleRestaurantCandidate
          ? deriveResponsePaginationPatch({
              response,
              append,
              targetPage,
              mergedFoodCount,
              mergedRestaurantCount,
              previousFoodCountSnapshot,
              previousRestaurantCountSnapshot,
              isPaginationExhausted,
            })
          : null;
        runNonCriticalStateUpdate(() => {
          unstable_batchedUpdates(() => {
            searchRuntimeBus.batch(() => {
              if (resolvedActiveTab != null) {
                setActiveTab(resolvedActiveTab);
                searchRuntimeBus.publish({
                  activeTab: resolvedActiveTab,
                  pendingTabSwitchTab: null,
                });
              }

              if (paginationPatch) {
                searchRuntimeBus.publish({
                  ...paginationPatch,
                });
              }
            });
          });
        });
        logSearchPhase('handleSearchResponse:meta-applied');
      };

      if (append) {
        publishRuntimeLaneState(tuple, 'lane_c_list_first_paint');
        applyResponseMetaState();
      } else {
        scheduleOnNextFrame(() => {
          if (isResponseApplyStale()) {
            return;
          }
          publishRuntimeLaneState(tuple, 'lane_c_list_first_paint');
          applyResponseMetaState();
        });
      }

      if (!append) {
        scheduleOnNextFrame(() => {
          if (isResponseApplyStale()) {
            return;
          }
          const deferredUiProjection = deriveSearchResponseDeferredUiProjection({
            searchRequestId: committedSearchRequestId,
            submittedLabel,
            singleRestaurantCandidate,
            isProfilePresentationActive: Boolean(getIsProfilePresentationActive?.()),
          });
          runNonCriticalStateUpdate(() => {
            unstable_batchedUpdates(() => {
              searchRuntimeBus.batch(() => {
                lastSearchRequestIdRef.current = deferredUiProjection.searchRequestId;
                searchRuntimeBus.publish(deferredUiProjection.runtimePatch);

                if (deferredUiProjection.shouldHideResultsSheet) {
                  resetSheetToHidden();
                }
              });
            });
          });
          logSearchPhase('handleSearchResponse:ui-deferred');
        });
      }

      if (!append && submittedLabel && pushToHistory) {
        const historyProjection = deriveSearchResponseHistoryProjection({
          response,
          submittedLabel,
          submissionContext,
        });

        const enqueueHistoryUpdate = () => {
          if (isResponseApplyStale()) {
            return;
          }
          if (historyProjection.recentSearch) {
            updateLocalRecentSearches(historyProjection.recentSearch);
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
    },
    [
      activeTab,
      deriveResponsePaginationPatch,
      deriveSearchResponseDeferredUiProjection,
      deriveSearchResponseHistoryProjection,
      getIsProfilePresentationActive,
      isPaginationExhausted,
      isSearchEditingRef,
      lastSearchRequestIdRef,
      loadRecentHistory,
      logSearchPhase,
      publishRuntimeLaneState,
      resetSheetToHidden,
      resolveResponseActiveTab,
      runNonCriticalStateUpdate,
      scheduleOnNextFrame,
      scrollResultsToTop,
      searchRuntimeBus,
      setActiveTab,
      updateLocalRecentSearches,
    ]
  );

  const commitSearchResponsePhaseA = React.useCallback(
    ({
      tuple,
      append,
      targetPage,
      initialUiState,
      committedResponse,
      committedSearchRequestId,
      requestBounds,
      replaceResultsInPlace,
      isResponseApplyStale,
      emitShadowTransition,
    }: SearchResponsePhaseACommitOptions): boolean => {
      if (
        !emitShadowTransition('phase_a_committed', {
          append,
          targetPage,
          requestId: committedSearchRequestId,
        })
      ) {
        clearActiveOperationTuple(tuple);
        return false;
      }
      searchRuntimeBus.batch(() => {
        publishRuntimeLaneState(tuple, 'lane_b_data_commit', {
          searchMode: initialUiState.mode,
          isSearchSessionActive: true,
          activeTab: initialUiState.targetTab,
          pendingTabSwitchTab: null,
        });
      });
      if (!append && committedResponse.metadata.page === 1 && !isResponseApplyStale()) {
        onPageOneResultsCommitted?.({
          searchRequestId: committedSearchRequestId,
          requestBounds: requestBounds ?? null,
          replaceResultsInPlace: Boolean(replaceResultsInPlace),
        });
      }
      return true;
    },
    [
      clearActiveOperationTuple,
      onPageOneResultsCommitted,
      publishRuntimeLaneState,
      searchRuntimeBus,
    ]
  );

  const applySearchResponseLifecycleContext = React.useCallback(
    ({
      normalizedResponse,
      append,
      targetPage,
      initialUiState,
      submittedLabel,
      pushToHistory,
      submissionContext,
      requestBounds,
      replaceResultsInPlace,
      runtimeTuple,
      emitShadowTransition,
      handleStart,
      isResponseApplyStale,
      responseContext,
    }: ApplySearchResponseLifecycleContextOptions) => {
      searchRuntimeBus.batch(() => {
        searchRuntimeBus.publish(responseContext.resultsPatch);
      });
      logSearchPhase('handleSearchResponse:results-committed');
      if (
        !commitSearchResponsePhaseA({
          tuple: runtimeTuple,
          append,
          targetPage,
          initialUiState,
          committedResponse: responseContext.committedResponse,
          committedSearchRequestId: responseContext.committedSearchRequestId,
          requestBounds,
          replaceResultsInPlace,
          isResponseApplyStale,
          emitShadowTransition,
        })
      ) {
        return;
      }

      scheduleResponsePostCommitUiSequence({
        append,
        tuple: runtimeTuple,
        targetPage,
        initialTargetTab: initialUiState.targetTab,
        response: normalizedResponse,
        submissionContext,
        singleRestaurantCandidate: responseContext.singleRestaurantCandidate,
        mergedFoodCount: responseContext.mergedFoodCount,
        mergedRestaurantCount: responseContext.mergedRestaurantCount,
        previousFoodCountSnapshot: responseContext.previousFoodCountSnapshot,
        previousRestaurantCountSnapshot: responseContext.previousRestaurantCountSnapshot,
        committedSearchRequestId: responseContext.committedSearchRequestId,
        submittedLabel,
        pushToHistory,
        isResponseApplyStale,
      });
      const finalizeShadowTransitions = () => {
        if (isResponseApplyStale()) {
          clearActiveOperationTuple(runtimeTuple);
          return;
        }
        scheduleResponseShadowSettleSequence({
          tuple: runtimeTuple,
          append,
          targetPage,
          responseRequestId: responseContext.committedSearchRequestId,
          handleStart,
          isResponseApplyStale,
          emitShadowTransition,
        });
      };
      if (append) {
        finalizeShadowTransitions();
        return;
      }
      scheduleAfterHealthyFrames({
        requestId: runtimeTuple.requestId,
        requiredHealthyFrames: 1,
        maxWaitMs: 140,
        onReady: finalizeShadowTransitions,
      });
    },
    [
      clearActiveOperationTuple,
      commitSearchResponsePhaseA,
      logSearchPhase,
      scheduleAfterHealthyFrames,
      scheduleResponsePostCommitUiSequence,
      scheduleResponseShadowSettleSequence,
      searchRuntimeBus,
    ]
  );

  const executeSearchResponseLifecycle = React.useCallback(
    ({
      normalizedResponse,
      append,
      targetPage,
      initialUiState,
      submittedLabel,
      pushToHistory,
      submissionContext,
      requestBounds,
      replaceResultsInPlace,
      runtimeTuple,
      emitShadowTransition,
      handleStart,
      isResponseApplyStale,
    }: SearchResponseLifecycleOptions) => {
      logSearchPhase('handleSearchResponse:start');
      const mergeStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
      const responseContext = deriveSearchResponseLifecycleContext({
        baseResponse: append ? currentResults : null,
        normalizedResponse,
        append,
        runtimeMode: runtimeTuple.mode,
        requestId: runtimeTuple.requestId,
        initialTargetTab: initialUiState.targetTab,
        activeTab,
        pendingTabSwitchTab,
        scoreMode,
        bounds: latestBoundsRef.current,
        userLocation: userLocationRef.current,
      });
      if (shouldLogSearchResponseTimings) {
        logSearchResponseTiming('mergeSearchResponses', getPerfNow() - mergeStart);
      }
      applySearchResponseLifecycleContext({
        normalizedResponse,
        append,
        targetPage,
        initialUiState,
        submittedLabel,
        pushToHistory,
        submissionContext,
        requestBounds,
        replaceResultsInPlace,
        runtimeTuple,
        emitShadowTransition,
        handleStart,
        isResponseApplyStale,
        responseContext,
      });
    },
    [
      activeTab,
      applySearchResponseLifecycleContext,
      currentResults,
      deriveSearchResponseLifecycleContext,
      latestBoundsRef,
      logSearchPhase,
      logSearchResponseTiming,
      pendingTabSwitchTab,
      scoreMode,
      shouldLogSearchResponseTimings,
      userLocationRef,
    ]
  );

  const prepareSearchResponseLifecycleEntry = React.useCallback(
    (
      response: SearchResponse,
      options: Pick<
        SearchSubmitResponseHandlerOptions,
        | 'append'
        | 'targetPage'
        | 'fallbackSearchRequestId'
        | 'responseReceivedPayload'
        | 'runtimeShadow'
      >
    ): SearchResponseLifecycleEntry | null => {
      const handleStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
      const { append, targetPage, fallbackSearchRequestId, runtimeShadow } = options;
      const { runtimeTuple } = runtimeShadow;
      const emitShadowTransition = runtimeShadow.emitShadowTransition;
      const appendFallbackSearchRequestId = append
        ? currentResults?.metadata?.searchRequestId ?? undefined
        : undefined;
      const normalizedResponse = normalizeSearchResponse(
        response,
        targetPage,
        fallbackSearchRequestId ?? appendFallbackSearchRequestId
      );
      const responseApplyToken = responseApplyTokenRef.current + 1;
      responseApplyTokenRef.current = responseApplyToken;
      const isResponseApplyStale = () => {
        if (!isMountedRef.current || responseApplyTokenRef.current !== responseApplyToken) {
          return true;
        }
        if (!isRequestStillActive(runtimeTuple.requestId)) {
          return true;
        }
        const activeTuple = activeOperationTupleRef.current;
        return activeTuple?.operationId !== runtimeTuple.operationId;
      };
      if (!emitShadowTransition('response_received', options.responseReceivedPayload)) {
        clearActiveOperationTuple(runtimeTuple);
        return null;
      }

      return {
        normalizedResponse,
        handleStart,
        isResponseApplyStale,
        runtimeTuple,
        emitShadowTransition,
      };
    },
    [
      activeOperationTupleRef,
      clearActiveOperationTuple,
      currentResults,
      isMountedRef,
      isRequestStillActive,
      normalizeSearchResponse,
      responseApplyTokenRef,
      shouldLogSearchResponseTimings,
    ]
  );

  const handleSearchResponse = React.useCallback(
    (response: SearchResponse, options: SearchSubmitResponseHandlerOptions) => {
      const responseEntry = prepareSearchResponseLifecycleEntry(response, options);
      if (!responseEntry) {
        return;
      }
      executeSearchResponseLifecycle({
        normalizedResponse: responseEntry.normalizedResponse,
        append: options.append,
        targetPage: options.targetPage,
        initialUiState: options.initialUiState,
        submittedLabel: options.submittedLabel,
        pushToHistory: options.pushToHistory,
        submissionContext: options.submissionContext,
        requestBounds: options.requestBounds,
        replaceResultsInPlace: options.replaceResultsInPlace,
        runtimeTuple: responseEntry.runtimeTuple,
        emitShadowTransition: responseEntry.emitShadowTransition,
        handleStart: responseEntry.handleStart,
        isResponseApplyStale: responseEntry.isResponseApplyStale,
      });
    },
    [executeSearchResponseLifecycle, prepareSearchResponseLifecycleEntry]
  );

  return React.useMemo(
    () => ({
      handleSearchResponse,
    }),
    [handleSearchResponse]
  );
};
