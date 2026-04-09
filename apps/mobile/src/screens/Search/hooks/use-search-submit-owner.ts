import React from 'react';

import type { UseSearchRequestsResult } from '../../../hooks/useSearchRequests';
import type { Coordinate, MapBounds, NaturalSearchRequest, SearchResponse } from '../../../types';
import type { RecentSearch, StructuredSearchRequest } from '../../../services/search';
import type { SegmentValue } from '../constants/search';
import type { MapboxMapRef } from '../components/search-map';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import type { RuntimeWorkScheduler } from '../runtime/scheduler/runtime-work-scheduler';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import {
  useSearchRequestPreparationOwner,
  type StructuredSearchFilters,
} from './use-search-request-preparation-owner';
import {
  useSearchSubmitEntryOwner,
  type SearchMode,
  type SubmitSearchOptions,
} from './use-search-submit-entry-owner';
import { useSearchNaturalSubmitOwner } from './use-search-natural-submit-owner';
import { useSearchSubmitExecutionOwner } from './use-search-submit-execution-owner';
import { useSearchSubmitResponseOwner } from './use-search-submit-response-owner';
import { useSearchSubmitStructuredHelperOwner } from './use-search-submit-structured-helper-owner';
import { useSearchStructuredSubmitOwner } from './use-search-structured-submit-owner';
import { useSearchSubmitActionOwner } from './use-search-submit-action-owner';
import type { SearchRequestRuntimeOwner } from './use-search-request-runtime-owner';
type SearchSubmitOwnerReadModel = {
  query: string;
  submittedQuery: string;
  hasResults: boolean;
  canLoadMore: boolean;
  currentPage: number;
  activeTab: SegmentValue;
  currentResults: SearchResponse | null;
  isPaginationExhausted: boolean;
  pendingTabSwitchTab: SegmentValue | null;
  preferredActiveTab: SegmentValue;
  hasActiveTabPreference: boolean;
  isLoadingMore: boolean;
  openNow: boolean;
  priceLevels: number[];
  votes100Plus: boolean;
  scoreMode: NaturalSearchRequest['scoreMode'];
};

type SearchSubmitOwnerUiPorts = {
  setActiveTab: React.Dispatch<React.SetStateAction<SegmentValue>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  resetSheetToHidden: () => void;
  scrollResultsToTop: () => void;
  isSearchEditingRef?: React.MutableRefObject<boolean>;
  resetMapMoveFlag: () => void;
  loadRecentHistory: (options?: { force?: boolean }) => Promise<void>;
  updateLocalRecentSearches: (value: string | RecentSearchInput) => void;
  getIsProfilePresentationActive?: () => boolean;
  clearMapHighlightedRestaurantId?: () => void;
  onPageOneResultsCommitted?: (payload: {
    searchRequestId: string | null;
    requestBounds: MapBounds | null;
    replaceResultsInPlace: boolean;
  }) => void;
  onShortcutSearchCoverageSnapshot?: (snapshot: {
    searchRequestId: string;
    bounds: MapBounds | null;
    entities: StructuredSearchRequest['entities'];
  }) => void;
  onPresentationIntentStart?: (params: {
    kind: 'initial_search' | 'shortcut_rerun';
    mode: SearchMode;
    preserveSheetState: boolean;
    transitionFromDockedPolls: boolean;
    targetTab: SegmentValue;
    submittedLabel?: string;
  }) => void;
  onPresentationIntentAbort?: () => void;
};

type SearchSubmitOwnerRuntimePorts = {
  runtimeWorkSchedulerRef?: React.MutableRefObject<RuntimeWorkScheduler> | null;
  searchRuntimeBus: SearchRuntimeBus;
  lastSearchRequestIdRef: React.MutableRefObject<string | null>;
  lastAutoOpenKeyRef: React.MutableRefObject<string | null>;
  runSearch: UseSearchRequestsResult['runSearch'];
  mapRef: React.RefObject<MapboxMapRef | null>;
  latestBoundsRef: React.MutableRefObject<MapBounds | null>;
  viewportBoundsService: ViewportBoundsService;
  ensureUserLocation: () => Promise<Coordinate | null>;
  userLocationRef: React.MutableRefObject<Coordinate | null>;
  requestRuntimeOwner: SearchRequestRuntimeOwner;
};

type UseSearchSubmitOwnerOptions = {
  readModel: SearchSubmitOwnerReadModel;
  uiPorts: SearchSubmitOwnerUiPorts;
  runtimePorts: SearchSubmitOwnerRuntimePorts;
};

type RecentSearchInput = {
  queryText: string;
  selectedEntityId?: string | null;
  selectedEntityType?: RecentSearch['selectedEntityType'] | null;
  statusPreview?: RecentSearch['statusPreview'] | null;
};

type SearchSubmitOwner = {
  submitSearch: (options?: SubmitSearchOptions, overrideQuery?: string) => Promise<void>;
  runRestaurantEntitySearch: (params: {
    restaurantId: string;
    restaurantName: string;
    submissionSource: NaturalSearchRequest['submissionSource'];
    typedPrefix?: string;
    preserveSheetState?: boolean;
  }) => Promise<void>;
  submitViewportShortcut: (
    targetTab: SegmentValue,
    submittedLabel: string,
    options?: {
      preserveSheetState?: boolean;
      replaceResultsInPlace?: boolean;
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
    replaceResultsInPlace?: boolean;
  }) => Promise<void>;
  loadMoreResults: (searchMode: SearchMode) => void;
};

const useSearchSubmitOwner = ({
  readModel,
  uiPorts,
  runtimePorts,
}: UseSearchSubmitOwnerOptions): SearchSubmitOwner => {
  const {
    query,
    submittedQuery,
    hasResults,
    canLoadMore,
    currentPage,
    activeTab,
    currentResults,
    isPaginationExhausted,
    pendingTabSwitchTab,
    preferredActiveTab,
    hasActiveTabPreference,
    isLoadingMore,
    openNow,
    priceLevels,
    votes100Plus,
    scoreMode,
  } = readModel;
  const {
    setActiveTab,
    setError,
    resetSheetToHidden,
    scrollResultsToTop,
    isSearchEditingRef,
    resetMapMoveFlag,
    loadRecentHistory,
    updateLocalRecentSearches,
    getIsProfilePresentationActive,
    clearMapHighlightedRestaurantId,
    onPageOneResultsCommitted,
    onShortcutSearchCoverageSnapshot,
    onPresentationIntentStart,
    onPresentationIntentAbort,
  } = uiPorts;
  const {
    runtimeWorkSchedulerRef,
    searchRuntimeBus,
    lastSearchRequestIdRef,
    lastAutoOpenKeyRef,
    runSearch,
    mapRef,
    latestBoundsRef,
    viewportBoundsService,
    ensureUserLocation,
    userLocationRef,
    requestRuntimeOwner,
  } = runtimePorts;
  const {
    activeSearchRequestRef,
    activeLoadingMoreTokenRef,
    isSearchRequestInFlightRef,
    activeOperationTupleRef,
    responseApplyTokenRef,
    isMountedRef,
    clearActiveOperationTuple,
    isRequestStillActive,
    isOperationTupleStillActive,
    publishRuntimeLaneState,
    createHandleSearchResponseRuntimeShadow,
    runManagedRequestAttempt,
    setSearchRequestInFlight,
  } = requestRuntimeOwner;
  const {
    prepareStructuredInitialRequestPayload,
    prepareStructuredAppendRequestPayload,
    prepareNaturalSearchAttemptPayload,
  } = useSearchRequestPreparationOwner({
    isLoadingMore,
    scoreMode,
    openNow,
    priceLevels,
    votes100Plus,
    searchRuntimeBus,
    latestBoundsRef,
    viewportBoundsService,
    mapRef,
    ensureUserLocation,
    userLocationRef,
    lastSearchRequestIdRef,
    isOperationTupleStillActive,
    setError,
  });
  const {
    prepareSearchRequestForegroundUi,
    prepareNaturalSearchForegroundUi,
    createRestaurantEntityInitialAttemptConfig,
    createShortcutStructuredInitialAttemptConfig,
    createShortcutStructuredAppendAttemptConfig,
    prepareNaturalSearchEntry,
    resolveNaturalSearchAttemptConfig,
  } = useSearchSubmitEntryOwner({
    query,
    submittedQuery,
    preferredActiveTab,
    hasActiveTabPreference,
    isLoadingMore,
    openNow,
    priceLevels,
    votes100Plus,
    setActiveTab,
    setError,
    searchRuntimeBus,
    clearMapHighlightedRestaurantId,
    resetMapMoveFlag,
    activeOperationTupleRef,
    activeLoadingMoreTokenRef,
    isSearchRequestInFlightRef,
    publishRuntimeLaneState,
    setSearchRequestInFlight,
    lastAutoOpenKeyRef,
    onPresentationIntentStart,
  });
  const { handleSearchResponse } = useSearchSubmitResponseOwner({
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
  });
  const {
    primeShortcutStructuredRequest,
    applyShortcutStructuredAppendRequestState,
    publishShortcutCoverageForResponse,
    applyRestaurantEntityStructuredRequest,
  } = useSearchSubmitStructuredHelperOwner({
    onShortcutSearchCoverageSnapshot,
  });
  const {
    startNaturalResponseLifecycle,
    startEntityStructuredResponseLifecycle,
    startShortcutInitialResponseLifecycle,
    startShortcutAppendResponseLifecycle,
    executeEntityStructuredSearchAttempt,
    executeShortcutStructuredSearchAttempt,
    executeNaturalSearchAttempt,
  } = useSearchSubmitExecutionOwner({
    runSearch,
    activeSearchRequestRef,
    createHandleSearchResponseRuntimeShadow,
    handleSearchResponse,
    publishShortcutCoverageForResponse,
  });
  const { runRestaurantEntitySearch, submitViewportShortcut, loadMoreShortcutResults } =
    useSearchStructuredSubmitOwner({
      currentPage,
      canLoadMore,
      hasResults,
      isLoadingMore,
      isPaginationExhausted,
      preferredActiveTab,
      submittedQuery,
      isSearchRequestInFlightRef,
      runManagedRequestAttempt,
      onPresentationIntentAbort,
      setError,
      resetMapMoveFlag,
      createRestaurantEntityInitialAttemptConfig,
      createShortcutStructuredInitialAttemptConfig,
      createShortcutStructuredAppendAttemptConfig,
      prepareSearchRequestForegroundUi,
      prepareStructuredInitialRequestPayload,
      prepareStructuredAppendRequestPayload,
      applyRestaurantEntityStructuredRequest,
      primeShortcutStructuredRequest,
      applyShortcutStructuredAppendRequestState,
      executeEntityStructuredSearchAttempt,
      executeShortcutStructuredSearchAttempt,
      startEntityStructuredResponseLifecycle,
      startShortcutInitialResponseLifecycle,
      startShortcutAppendResponseLifecycle,
    });
  const { submitSearch } = useSearchNaturalSubmitOwner({
    prepareNaturalSearchEntry,
    resolveNaturalSearchAttemptConfig,
    prepareNaturalSearchForegroundUi,
    prepareNaturalSearchAttemptPayload,
    executeNaturalSearchAttempt,
    startNaturalResponseLifecycle,
    runManagedRequestAttempt,
    onPresentationIntentAbort,
    setError,
  });

  const { loadMoreResults, rerunActiveSearch } = useSearchSubmitActionOwner({
    query,
    submittedQuery,
    hasResults,
    canLoadMore,
    currentPage,
    isLoadingMore,
    isPaginationExhausted,
    isSearchRequestInFlightRef,
    submitSearch,
    loadMoreShortcutResults,
    submitViewportShortcut,
  });

  return {
    submitSearch,
    runRestaurantEntitySearch,
    submitViewportShortcut,
    rerunActiveSearch,
    loadMoreResults,
  };
};

export default useSearchSubmitOwner;
