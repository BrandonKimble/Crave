import React from 'react';
import { InteractionManager, Keyboard, unstable_batchedUpdates } from 'react-native';

import type {
  Coordinate,
  FoodResult,
  MapBounds,
  NaturalSearchRequest,
  RestaurantResult,
  SearchResponse,
} from '../../../types';
import type { RecentSearch, SearchRequestCacheStatus } from '../../../services/search';
import type { RuntimeWorkScheduler } from '../runtime/scheduler/runtime-work-scheduler';
import type {
  SearchSessionEventPayload,
  SearchSessionEventType,
} from '../runtime/controller/search-session-events';
import {
  computeMarkerPipeline,
  type MarkerPipelineResult,
} from '../runtime/map/compute-marker-pipeline';
import type { ResultsPresentationAuthority } from '../runtime/shared/results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from '../runtime/shared/results-presentation-surface-authority';
import type { SearchRuntimeBus, SearchRuntimeBusState } from '../runtime/shared/search-runtime-bus';
import { isResultsPresentationExecutionStageSettled } from '../runtime/shared/results-presentation-runtime-contract';
import {
  getSearchMountedResultsDataSnapshot,
  publishSearchMountedResultsDataSnapshot,
  type SearchMountedResultsMarkerProjection,
  type SearchMountedResultsMarkerProjectionByTab,
} from '../runtime/shared/search-mounted-results-data-store';
import { buildResultsIdentityKey } from '../runtime/shared/results-identity-key';
import type { SegmentValue } from '../constants/search';
import {
  resolveSubmissionDefaultTab,
  type SearchMode,
  type SearchSubmitPresentationIntentKind,
} from './use-search-submit-entry-owner';
import { mergeSearchResponses } from '../utils/merge';
import { resolveSingleRestaurantCandidate } from '../utils/response';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
  logPerfScenarioSearchRequestLifecycle,
} from '../../../perf/perf-scenario-attribution';
import {
  getPerfScenarioWorkNow,
  logPerfScenarioWorkSpan,
  measurePerfScenarioWorkSpan,
} from '../../../perf/perf-scenario-work-span';
import { usePerfScenarioRuntimeStore } from '../../../perf/perf-scenario-runtime-store';

export type SearchSubmitActiveOperationTuple = {
  mode: 'natural' | 'entity' | 'shortcut' | 'favorites';
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
  submittedLabel?: string;
  pushToHistory?: boolean;
  submissionContext?: NaturalSearchRequest['submissionContext'];
  requestBounds?: MapBounds | null;
  replaceResultsInPlace?: boolean;
  presentationIntentKind?: Extract<SearchSubmitPresentationIntentKind, 'search_this_area'>;
  responseReceivedPayload: SearchSessionEventPayload;
  responseCacheStatus?: SearchRequestCacheStatus | null;
  runtimeShadow: SearchSubmitHandleSearchResponseRuntimeShadow;
};

type SearchResponseResultsCommitPatch = Pick<
  SearchRuntimeBusState,
  | 'resultsRequestKey'
  | 'resultsIdentityCandidateKey'
  | 'resultsPage'
  | 'resultsDishCount'
  | 'resultsRestaurantCount'
>;

type SearchResponseResultsCommitProjection = {
  committedResponse: SearchResponse;
  mergedFoodCount: number;
  mergedRestaurantCount: number;
  searchRequestId: string;
  markerProjectionByTab: SearchMountedResultsMarkerProjectionByTab;
  resultsPatch: SearchResponseResultsCommitPatch;
};

type SearchResponseRootBusResultsPatch = Pick<
  SearchRuntimeBusState,
  'resultsIdentityCandidateKey' | 'resultsDishCount' | 'resultsRestaurantCount'
> &
  Partial<Pick<SearchRuntimeBusState, 'resultsRequestKey' | 'resultsPage'>>;

type SearchResponseDeferredUiProjection = {
  searchRequestId: string;
  runtimePatch: Pick<SearchRuntimeBusState, 'submittedQuery' | 'isPaginationExhausted'>;
  shouldHideResultsSheet: boolean;
};

type SearchResponseHistoryProjection = {
  recentSearch: RecentSearchInput | null;
};

type ResultsActiveTab = 'dishes' | 'restaurants';

const MARKER_PIPELINE_CACHE_LIMIT = 12;
const markerPipelineCache = new Map<string, MarkerPipelineResult>();

const deriveSearchResponseRootBusResultsPatch = ({
  patch,
  preserveRouteIdentity,
}: {
  patch: SearchResponseResultsCommitPatch;
  preserveRouteIdentity: boolean;
}): SearchResponseRootBusResultsPatch =>
  preserveRouteIdentity
    ? patch
    : {
        resultsIdentityCandidateKey: patch.resultsIdentityCandidateKey,
        resultsDishCount: patch.resultsDishCount,
        resultsRestaurantCount: patch.resultsRestaurantCount,
      };

const normalizeCacheNumber = (value: unknown): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(5) : 'null';

const buildLocationCacheKey = (
  location:
    | {
        latitude?: number | null;
        longitude?: number | null;
        lat?: number | null;
        lng?: number | null;
      }
    | null
    | undefined
): string =>
  location == null
    ? 'none'
    : `${normalizeCacheNumber(location.latitude ?? location.lat)}:${normalizeCacheNumber(
        location.longitude ?? location.lng
      )}`;

const buildMarkerPipelineCacheKey = ({
  activeTab,
  bounds,
  dishes,
  restaurants,
  userLocation,
}: {
  activeTab: ResultsActiveTab;
  bounds: MapBounds | null;
  dishes: FoodResult[];
  restaurants: RestaurantResult[];
  userLocation: Coordinate | null;
}): string => {
  const restaurantKey = restaurants
    .map((restaurant) => {
      const locationList: Array<{ latitude?: number | null; longitude?: number | null }> =
        Array.isArray(restaurant.locations) ? restaurant.locations : [];
      const displayLocation =
        restaurant.displayLocation ??
        locationList.find(
          (location) =>
            typeof location.latitude === 'number' && typeof location.longitude === 'number'
        );
      return [
        restaurant.restaurantId,
        restaurant.rank ?? 'na',
        restaurant.craveScore ?? 'na',
        buildLocationCacheKey(displayLocation),
      ].join(':');
    })
    .join('|');
  const dishKey = dishes
    .map((dish) =>
      [
        dish.foodId,
        dish.restaurantId,
        dish.craveScore ?? 'na',
        dish.restaurantCraveScore ?? 'na',
        buildLocationCacheKey({
          latitude: dish.restaurantLatitude,
          longitude: dish.restaurantLongitude,
        }),
      ].join(':')
    )
    .join('|');
  return [
    `tab:${activeTab}`,
    `bounds:${buildLocationCacheKey(bounds?.northEast)}:${buildLocationCacheKey(
      bounds?.southWest
    )}`,
    `user:${buildLocationCacheKey(userLocation)}`,
    `restaurants:${restaurants.length}:${restaurantKey}`,
    `dishes:${dishes.length}:${dishKey}`,
  ].join('::');
};

const retainMarkerPipelineCacheEntry = (cacheKey: string, result: MarkerPipelineResult): void => {
  markerPipelineCache.delete(cacheKey);
  markerPipelineCache.set(cacheKey, result);
  while (markerPipelineCache.size > MARKER_PIPELINE_CACHE_LIMIT) {
    const firstKey = markerPipelineCache.keys().next().value;
    if (typeof firstKey !== 'string') {
      break;
    }
    markerPipelineCache.delete(firstKey);
  }
};

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
  dataReadyFrom: 'network' | 'cache' | 'in_flight';
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
  resultsIdentityKey: string | null;
  resultsDataKey: string | null;
  dataReadyFrom: 'network' | 'cache' | 'in_flight';
  searchInputKey: string | null;
  requestBounds?: MapBounds | null;
  replaceResultsInPlace?: boolean;
  presentationIntentKind?: Extract<SearchSubmitPresentationIntentKind, 'search_this_area'>;
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
  markerProjectionByTab: SearchMountedResultsMarkerProjectionByTab;
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
  presentationIntentKind?: Extract<SearchSubmitPresentationIntentKind, 'search_this_area'>;
  runtimeTuple: SearchSubmitActiveOperationTuple;
  emitShadowTransition: SearchSubmitHandleSearchResponseRuntimeShadow['emitShadowTransition'];
  handleStart: number;
  isResponseApplyStale: () => boolean;
  responseCacheStatus?: SearchRequestCacheStatus | null;
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
  isPaginationExhausted: boolean;
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
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
    resultsIdentityKey: string | null;
    resultsDataKey: string | null;
    dataReadyFrom: 'network' | 'cache' | 'in_flight';
    searchInputKey: string | null;
    replaceResultsInPlace: boolean;
    presentationIntentKind?: Extract<SearchSubmitPresentationIntentKind, 'search_this_area'>;
  }) => void;
  activeOperationTupleRef: React.MutableRefObject<SearchSubmitActiveOperationTuple | null>;
  responseApplyTokenRef: React.MutableRefObject<number>;
  isMountedRef: React.MutableRefObject<boolean>;
  clearActiveOperationTuple: (tuple: SearchSubmitActiveOperationTuple) => void;
  isRequestStillActive: (requestId: number) => boolean;
  runtimeWorkSchedulerRef?: React.MutableRefObject<RuntimeWorkScheduler> | null;
  publishRuntimeLaneState: (
    tuple: SearchSubmitActiveOperationTuple | null,
    lane: 'lane_b_data_commit' | 'lane_c_prepared_rows' | 'lane_d_map_dots' | 'lane_e_map_pins',
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

const logSearchResponseLifecycle = (payload: Record<string, unknown>): void => {
  logPerfScenarioSearchRequestLifecycle({
    source: 'useSearchSubmitResponseOwner',
    ...payload,
  });
};

const getSearchResponseLifecycleSummary = (
  response: SearchResponse | null
): Record<string, unknown> => ({
  responseSearchRequestId: response?.metadata?.searchRequestId ?? null,
  responsePage: response?.metadata?.page ?? null,
  responseDishCount: response?.dishes?.length ?? 0,
  responseRestaurantCount: response?.restaurants?.length ?? 0,
});

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
  if (runtimeMode === 'favorites') {
    // A favorites launch carries its axis through initialTargetTab (derived from
    // the list's type at the execute attempt). Honor it when the matching array
    // is populated; otherwise fall back to whichever array actually has results
    // so the tab never auto-selects an empty list.
    const hasFoodResults = (response.dishes?.length ?? 0) > 0;
    const hasRestaurantsResults = (response.restaurants?.length ?? 0) > 0;
    if (initialTargetTab === 'dishes' && hasFoodResults) {
      return 'dishes';
    }
    if (initialTargetTab === 'restaurants' && hasRestaurantsResults) {
      return 'restaurants';
    }
    if (hasFoodResults) {
      return 'dishes';
    }
    if (hasRestaurantsResults) {
      return 'restaurants';
    }
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
  bounds: MapBounds | null;
  userLocation: Coordinate | null;
}): SearchResponseResultsCommitProjection => {
  const {
    mergedResponse,
    normalizedResponse,
    runtimeMode,
    requestId,
    markerPipelineActiveTab,
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
  const resultsPage =
    typeof committedResponse.metadata?.page === 'number' && committedResponse.metadata.page > 0
      ? committedResponse.metadata.page
      : 1;
  const totalFoodResults =
    typeof committedResponse.metadata?.totalFoodResults === 'number'
      ? committedResponse.metadata.totalFoodResults
      : 'na';
  const totalRestaurantResults =
    typeof committedResponse.metadata?.totalRestaurantResults === 'number'
      ? committedResponse.metadata.totalRestaurantResults
      : 'na';
  const resultsIdentityCandidateKey = buildResultsIdentityKey({
    searchRequestId,
    page: resultsPage,
    dishCount: mergedFoodCount,
    restaurantCount: mergedRestaurantCount,
    totalFoodResults,
    totalRestaurantResults,
  });
  const restaurants = committedResponse.restaurants ?? [];
  const dishes = committedResponse.dishes ?? [];
  // R1a-2 (plans/search-flow-plan.md §D6): precompute the marker projection for BOTH tabs from
  // this same committed response — same bounds/userLocation/anchor inputs, same resultsKey —
  // so a tab toggle finds its target-tab catalog precomputed and the controller's fallback
  // full-catalog rebuild (the R1a contract window, with its divergent live location anchor)
  // never fires. A tab whose axis the response genuinely lacks gets a null entry: the
  // controller then legitimately computes it without tripping the contract.
  const pipelineStartedAtMs = globalThis.performance?.now?.() ?? Date.now();
  const computeMarkerProjectionForTab = (
    tab: ResultsActiveTab
  ): { projection: SearchMountedResultsMarkerProjection | null; cacheHit: boolean } => {
    const axisIsEmpty = tab === 'dishes' ? dishes.length === 0 : restaurants.length === 0;
    if (axisIsEmpty && tab !== markerPipelineActiveTab) {
      // Response lacks this axis (e.g. entity/restaurant-only searches): no sibling
      // precompute — the controller's fallback handles it silently.
      return { projection: null, cacheHit: false };
    }
    const markerPipelineCacheKey = buildMarkerPipelineCacheKey({
      activeTab: tab,
      bounds,
      dishes,
      restaurants,
      userLocation,
    });
    const cachedPipelineResult = markerPipelineCache.get(markerPipelineCacheKey) ?? null;
    const pipelineResult =
      cachedPipelineResult != null
        ? {
            ...cachedPipelineResult,
            resultsKey: searchRequestId,
          }
        : computeMarkerPipeline({
            restaurants,
            dishes,
            activeTab: tab,
            restaurantOnlyId: null,
            selectedRestaurantId: null,
            bounds,
            userLocation,
            searchRequestId,
          });
    if (cachedPipelineResult == null) {
      retainMarkerPipelineCacheEntry(markerPipelineCacheKey, pipelineResult);
    } else {
      markerPipelineCache.delete(markerPipelineCacheKey);
      markerPipelineCache.set(markerPipelineCacheKey, cachedPipelineResult);
    }
    return {
      projection: {
        activeTab: tab,
        catalog: pipelineResult.catalog,
        canonicalRestaurantRankById: pipelineResult.canonicalRestaurantRankById,
        primaryCount: pipelineResult.primaryCount,
        restaurantsById: pipelineResult.restaurantsById,
        resultsKey: pipelineResult.resultsKey,
      },
      cacheHit: cachedPipelineResult != null,
    };
  };
  const dishesProjectionResult = computeMarkerProjectionForTab('dishes');
  const restaurantsProjectionResult = computeMarkerProjectionForTab('restaurants');
  const activeTabProjectionResult =
    markerPipelineActiveTab === 'dishes' ? dishesProjectionResult : restaurantsProjectionResult;
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (isPerfScenarioAttributionActive(scenarioConfig)) {
    logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
      event: 'results_data_reuse_contract',
      source: 'search_response_results_commit',
      activeTab: markerPipelineActiveTab,
      resultsIdentityCandidateKey,
      searchRequestId,
      markerPipelineCacheHit: activeTabProjectionResult.cacheHit,
      markerPipelineRecomputed: !activeTabProjectionResult.cacheHit,
      markerPipelineSiblingCacheHit:
        markerPipelineActiveTab === 'dishes'
          ? restaurantsProjectionResult.cacheHit
          : dishesProjectionResult.cacheHit,
      markerCatalogCount: activeTabProjectionResult.projection?.catalog.length ?? 0,
      markerPrimaryCount: activeTabProjectionResult.projection?.primaryCount ?? 0,
      markerSiblingCatalogCount:
        (markerPipelineActiveTab === 'dishes'
          ? restaurantsProjectionResult.projection?.catalog.length
          : dishesProjectionResult.projection?.catalog.length) ?? 0,
      restaurantCount: restaurants.length,
      dishCount: dishes.length,
      durationMs: Number(
        ((globalThis.performance?.now?.() ?? Date.now()) - pipelineStartedAtMs).toFixed(3)
      ),
    });
  }

  return {
    committedResponse,
    mergedFoodCount,
    mergedRestaurantCount,
    searchRequestId,
    markerProjectionByTab: {
      dishes: dishesProjectionResult.projection,
      restaurants: restaurantsProjectionResult.projection,
    },
    resultsPatch: {
      resultsRequestKey: searchRequestId,
      resultsIdentityCandidateKey,
      resultsPage,
      resultsDishCount: mergedFoodCount,
      resultsRestaurantCount: mergedRestaurantCount,
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
  bounds: MapBounds | null;
  userLocation: Coordinate | null;
}): SearchResponseLifecycleContext => {
  const merged = mergeSearchResponses(
    params.baseResponse,
    params.normalizedResponse,
    params.append
  );
  const markerPipelineActiveTab =
    (params.append ? (params.pendingTabSwitchTab ?? params.activeTab) : params.initialTargetTab) ??
    'dishes';
  const responseCommitProjection = deriveSearchResponseResultsCommitPatch({
    mergedResponse: merged,
    normalizedResponse: params.normalizedResponse,
    runtimeMode: params.runtimeMode,
    requestId: params.requestId,
    markerPipelineActiveTab: markerPipelineActiveTab as ResultsActiveTab,
    bounds: params.bounds,
    userLocation: params.userLocation,
  });

  return {
    // A favorites launch must ALWAYS show the list+toggle surface and honor the
    // listType-derived tab. The backend always emits restaurantFilters, so a
    // 1-restaurant list (or a dish list collapsing to one restaurant) would
    // otherwise trip the single-restaurant short-circuit (hide-sheet +
    // resolveResponseActiveTab early-return), collapsing into a single-restaurant
    // presentation. Suppress the candidate for favorites mode so neither fires.
    // (The profile auto-open path is suppressed separately, off the favorites
    // response marker — see profile-auto-open-action-runtime.)
    singleRestaurantCandidate:
      params.runtimeMode === 'favorites'
        ? null
        : resolveSingleRestaurantCandidate(params.normalizedResponse),
    previousFoodCountSnapshot: params.baseResponse?.dishes?.length ?? 0,
    previousRestaurantCountSnapshot: params.baseResponse?.restaurants?.length ?? 0,
    mergedFoodCount: responseCommitProjection.mergedFoodCount,
    mergedRestaurantCount: responseCommitProjection.mergedRestaurantCount,
    committedResponse: responseCommitProjection.committedResponse,
    committedSearchRequestId: responseCommitProjection.searchRequestId,
    markerProjectionByTab: responseCommitProjection.markerProjectionByTab,
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

const normalizeSearchResponse = (response: SearchResponse, targetPage: number): SearchResponse => {
  const normalizedPage = resolveResponsePage(response, targetPage);
  const hasSearchRequestId =
    typeof response.metadata?.searchRequestId === 'string' &&
    response.metadata.searchRequestId.length > 0;
  if (!hasSearchRequestId) {
    throw new Error('Search response missing required metadata.searchRequestId');
  }

  const shouldPatchPage = normalizedPage !== response.metadata?.page;

  if (!shouldPatchPage) {
    return response;
  }

  return {
    ...response,
    metadata: {
      ...response.metadata,
      page: normalizedPage,
    },
  };
};

export const useSearchSubmitResponseOwner = ({
  activeTab,
  currentResults,
  pendingTabSwitchTab,
  isPaginationExhausted,
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
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

  const scheduleAfterPreparedRowsReady = React.useCallback(
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
        const runtimeState = resultsPresentationSurfaceAuthority.getSnapshot();
        const runtimeRequestKey = getSearchMountedResultsDataSnapshot().resultsRequestKey ?? null;
        const hasExpectedRequest = runtimeRequestKey === expectedRequestKey;
        const expectedPreparedRowsKey =
          runtimeState.resultsIdentityKey ?? runtimeState.resultsRequestKey;
        const arePreparedRowsReady =
          hasExpectedRequest &&
          runtimeState.listPreparedRowsReady &&
          expectedPreparedRowsKey != null &&
          runtimeState.preparedRows.readyResultsIdentityKey === expectedPreparedRowsKey;
        if (arePreparedRowsReady) {
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
    [isRequestStillActive, resultsPresentationSurfaceAuthority, scheduleOnNextFrame]
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
        const runtimeState = searchRuntimeBus.getState();
        const runtimeOperationId = runtimeState.activeOperationId;
        if (runtimeOperationId != null && runtimeOperationId !== expectedOperationId) {
          return;
        }
        const laneIdle = runtimeState.activeOperationLane === 'idle';
        const visualSettled = isResultsPresentationExecutionStageSettled(
          resultsPresentationAuthority.getSnapshot().resultsPresentationTransport.executionStage
        );
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
      isRequestStillActive,
      resultsPresentationAuthority,
      runtimeWorkSchedulerRef,
      scheduleOnNextFrame,
      searchRuntimeBus,
    ]
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
      scheduleAfterPreparedRowsReady({
        requestId: tuple.requestId,
        maxWaitMs: 520,
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
      scheduleAfterPreparedRowsReady,
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
      dataReadyFrom,
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
        publishRuntimeLaneState(tuple, 'lane_c_prepared_rows');
        applyResponseMetaState();
      } else {
        scheduleOnNextFrame(() => {
          if (isResponseApplyStale()) {
            return;
          }
          publishRuntimeLaneState(tuple, 'lane_c_prepared_rows');
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

          if (dataReadyFrom !== 'cache') {
            void loadRecentHistory({ force: true });
          }
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
      resultsIdentityKey,
      resultsDataKey,
      dataReadyFrom,
      searchInputKey,
      requestBounds,
      replaceResultsInPlace,
      presentationIntentKind,
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
          resultsIdentityKey,
          resultsDataKey,
          dataReadyFrom,
          searchInputKey,
          replaceResultsInPlace: Boolean(replaceResultsInPlace),
          presentationIntentKind,
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
      presentationIntentKind,
      runtimeTuple,
      emitShadowTransition,
      handleStart,
      isResponseApplyStale,
      responseCacheStatus,
      responseContext,
    }: ApplySearchResponseLifecycleContextOptions) => {
      const dataReadyFrom = responseCacheStatus?.dataReadyFrom ?? 'network';
      const searchInputKey = responseCacheStatus?.searchInputKey ?? null;
      const resultsDataKey = responseContext.resultsPatch.resultsIdentityCandidateKey ?? null;
      searchRuntimeBus.batch(() => {
        const mountedDataPublishStartedAtMs = getPerfScenarioWorkNow();
        // [tclur] MOUNT-PUBLISH probe: when (and whether) a target-tab response actually re-commits into
        // mountedResults. On a rapid toggle-BACK, if this never fires with targetTab=restaurants the map
        // keeps the stale dish response. dataReadyFrom=cache|network|in_flight, stale=response-apply-staleness.
        // eslint-disable-next-line no-console
        console.log('[tclur] MOUNT-PUBLISH', {
          targetTab: initialUiState.targetTab,
          respR: responseContext.committedResponse.restaurants?.length ?? 0,
          respD: responseContext.committedResponse.dishes?.length ?? 0,
          dataReadyFrom,
          stale: isResponseApplyStale,
          bothTabs:
            responseContext.markerProjectionByTab.dishes != null &&
            responseContext.markerProjectionByTab.restaurants != null,
        });
        publishSearchMountedResultsDataSnapshot(responseContext.committedResponse, {
          activeTab: initialUiState.targetTab,
          markerProjectionByTab: responseContext.markerProjectionByTab,
          resultsIdentityKey: responseContext.resultsPatch.resultsIdentityCandidateKey,
        });
        logPerfScenarioWorkSpan({
          owner: 'search_response_mounted_results_data_publish',
          path: runtimeTuple.mode,
          startedAtMs: mountedDataPublishStartedAtMs,
          details: {
            resultsIdentityKey: responseContext.resultsPatch.resultsIdentityCandidateKey,
            activeTab: initialUiState.targetTab,
            responseDishCount: responseContext.committedResponse.dishes?.length ?? 0,
            responseRestaurantCount: responseContext.committedResponse.restaurants?.length ?? 0,
          },
        });
        const surfacePublishStartedAtMs = getPerfScenarioWorkNow();
        resultsPresentationSurfaceAuthority.publish(
          {
            resultsRequestKey: responseContext.resultsPatch.resultsRequestKey ?? null,
            resultsIdentityKey: responseContext.resultsPatch.resultsIdentityCandidateKey ?? null,
            resultsPreparedRowsKey: null,
            listPreparedRowsReady: false,
            isResultsHydrationSettled:
              responseContext.resultsPatch.resultsIdentityCandidateKey == null,
          },
          'search_response_owner_results_commit'
        );
        logPerfScenarioWorkSpan({
          owner: 'search_response_surface_authority_publish',
          path: runtimeTuple.mode,
          startedAtMs: surfacePublishStartedAtMs,
          details: {
            resultsIdentityKey: responseContext.resultsPatch.resultsIdentityCandidateKey,
            listenerCount: resultsPresentationSurfaceAuthority.readDiagnostics().listenerCount,
          },
        });
        const rootBusResultsPatch = deriveSearchResponseRootBusResultsPatch({
          patch: responseContext.resultsPatch,
          preserveRouteIdentity: append || targetPage !== 1 || runtimeTuple.mode !== 'shortcut',
        });
        const runtimeBusPublishStartedAtMs = getPerfScenarioWorkNow();
        searchRuntimeBus.publish(rootBusResultsPatch);
        logPerfScenarioWorkSpan({
          owner: 'search_response_runtime_bus_results_patch_publish',
          path: runtimeTuple.mode,
          startedAtMs: runtimeBusPublishStartedAtMs,
          details: {
            resultsIdentityKey: responseContext.resultsPatch.resultsIdentityCandidateKey,
            routeIdentityPublishSkipped:
              rootBusResultsPatch.resultsRequestKey == null &&
              rootBusResultsPatch.resultsPage == null,
            listenerCount: searchRuntimeBus.readDiagnostics().listenerCount,
          },
        });
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
          resultsIdentityKey: responseContext.resultsPatch.resultsIdentityCandidateKey ?? null,
          resultsDataKey,
          dataReadyFrom,
          searchInputKey,
          requestBounds,
          replaceResultsInPlace,
          presentationIntentKind,
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
        dataReadyFrom,
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
      resultsPresentationSurfaceAuthority,
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
      presentationIntentKind,
      runtimeTuple,
      emitShadowTransition,
      handleStart,
      isResponseApplyStale,
      responseCacheStatus,
    }: SearchResponseLifecycleOptions) => {
      logSearchPhase('handleSearchResponse:start');
      const mergeStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
      const responseContext = measurePerfScenarioWorkSpan(
        'search_response_lifecycle_context_derive',
        runtimeTuple.mode,
        () =>
          deriveSearchResponseLifecycleContext({
            baseResponse: append ? getSearchMountedResultsDataSnapshot().results : null,
            normalizedResponse,
            append,
            runtimeMode: runtimeTuple.mode,
            requestId: runtimeTuple.requestId,
            initialTargetTab: initialUiState.targetTab,
            activeTab,
            pendingTabSwitchTab,
            bounds: latestBoundsRef.current,
            userLocation: userLocationRef.current,
          }),
        {
          append,
          targetPage,
          responseDishCount: normalizedResponse.dishes?.length ?? 0,
          responseRestaurantCount: normalizedResponse.restaurants?.length ?? 0,
        }
      );
      if (shouldLogSearchResponseTimings) {
        logSearchResponseTiming('mergeSearchResponses', getPerfNow() - mergeStart);
      }
      const applyStartedAtMs = getPerfScenarioWorkNow();
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
        presentationIntentKind,
        runtimeTuple,
        emitShadowTransition,
        handleStart,
        isResponseApplyStale,
        responseCacheStatus,
        responseContext,
      });
      logPerfScenarioWorkSpan({
        owner: 'search_response_lifecycle_context_apply',
        path: runtimeTuple.mode,
        startedAtMs: applyStartedAtMs,
        details: {
          append,
          targetPage,
          operationId: runtimeTuple.operationId,
          resultsIdentityKey: responseContext.resultsPatch.resultsIdentityCandidateKey ?? null,
        },
      });
    },
    [
      activeTab,
      applySearchResponseLifecycleContext,
      deriveSearchResponseLifecycleContext,
      latestBoundsRef,
      logSearchPhase,
      logSearchResponseTiming,
      pendingTabSwitchTab,
      shouldLogSearchResponseTimings,
      userLocationRef,
    ]
  );

  const prepareSearchResponseLifecycleEntry = React.useCallback(
    (
      response: SearchResponse,
      options: Pick<
        SearchSubmitResponseHandlerOptions,
        'append' | 'targetPage' | 'responseReceivedPayload' | 'runtimeShadow'
      >
    ): SearchResponseLifecycleEntry | null => {
      const handleStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
      const { targetPage, runtimeShadow } = options;
      const { runtimeTuple } = runtimeShadow;
      const emitShadowTransition = runtimeShadow.emitShadowTransition;
      let normalizedResponse: SearchResponse;
      try {
        normalizedResponse = measurePerfScenarioWorkSpan(
          'search_response_normalize',
          runtimeTuple.mode,
          () => normalizeSearchResponse(response, targetPage),
          {
            targetPage,
            responseDishCount: response.dishes?.length ?? 0,
            responseRestaurantCount: response.restaurants?.length ?? 0,
          }
        );
      } catch (error) {
        logSearchResponseLifecycle({
          phase: 'response_lifecycle_skipped',
          reason: 'normalize_response_error',
          kind: runtimeTuple.mode,
          requestId: runtimeTuple.requestId,
          operationId: runtimeTuple.operationId,
          targetPage,
          errorMessage: error instanceof Error ? error.message : 'unknown error',
          ...getSearchResponseLifecycleSummary(response),
        });
        throw error;
      }
      logSearchResponseLifecycle({
        phase: 'response_lifecycle_enter',
        kind: runtimeTuple.mode,
        requestId: runtimeTuple.requestId,
        operationId: runtimeTuple.operationId,
        targetPage,
        append: options.append,
        ...getSearchResponseLifecycleSummary(normalizedResponse),
      });
      const responseApplyToken = responseApplyTokenRef.current + 1;
      responseApplyTokenRef.current = responseApplyToken;
      let didLogStaleRejection = false;
      const resolveResponseApplyStaleReason = (): string | null => {
        if (!isMountedRef.current) {
          return 'unmounted';
        }
        if (responseApplyTokenRef.current !== responseApplyToken) {
          return 'response_apply_token_replaced';
        }
        if (!isRequestStillActive(runtimeTuple.requestId)) {
          return 'request_not_active';
        }
        const activeTuple = activeOperationTupleRef.current;
        if (activeTuple?.operationId !== runtimeTuple.operationId) {
          return 'operation_not_active';
        }
        return null;
      };
      const isResponseApplyStale = () => {
        const staleReason = resolveResponseApplyStaleReason();
        if (staleReason == null) {
          return false;
        }
        if (!didLogStaleRejection) {
          didLogStaleRejection = true;
          logSearchResponseLifecycle({
            phase: 'response_lifecycle_stale_rejected',
            reason: staleReason,
            kind: runtimeTuple.mode,
            requestId: runtimeTuple.requestId,
            operationId: runtimeTuple.operationId,
            activeOperationId: activeOperationTupleRef.current?.operationId ?? null,
            targetPage,
            append: options.append,
            ...getSearchResponseLifecycleSummary(normalizedResponse),
          });
        }
        return true;
      };
      if (!emitShadowTransition('response_received', options.responseReceivedPayload)) {
        logSearchResponseLifecycle({
          phase: 'response_lifecycle_skipped',
          reason: 'shadow_response_received_rejected',
          kind: runtimeTuple.mode,
          requestId: runtimeTuple.requestId,
          operationId: runtimeTuple.operationId,
          activeOperationId: activeOperationTupleRef.current?.operationId ?? null,
          targetPage,
          append: options.append,
          ...getSearchResponseLifecycleSummary(normalizedResponse),
        });
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
        presentationIntentKind: options.presentationIntentKind,
        runtimeTuple: responseEntry.runtimeTuple,
        emitShadowTransition: responseEntry.emitShadowTransition,
        handleStart: responseEntry.handleStart,
        isResponseApplyStale: responseEntry.isResponseApplyStale,
        responseCacheStatus: options.responseCacheStatus ?? null,
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
