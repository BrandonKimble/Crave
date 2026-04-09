import React from 'react';

import type useSearchSubmitOwner from '../../hooks/use-search-submit-owner';
import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import type {
  SearchSessionProfileOwnerRuntime,
  SearchSessionSubmitRuntime,
} from './search-session-action-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSubmitPresentationRuntime } from './use-search-root-submit-presentation-runtime';

type UseSearchRootSubmitOwnerSurfaceRuntimeArgs = {
  profileOwnerRuntime: SearchSessionProfileOwnerRuntime;
  submitPresentationRuntime: SearchRootSubmitPresentationRuntime;
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
};

export const useSearchRootSubmitOwnerSurfaceRuntime = ({
  profileOwnerRuntime,
  submitPresentationRuntime,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
}: UseSearchRootSubmitOwnerSurfaceRuntimeArgs): SearchSessionSubmitRuntime => {
  const {
    requestPresentationFlowRuntime: { rootUiBridge, recentActivityRuntime },
  } = requestLaneRuntime;
  const {
    handlePageOneResultsCommitted,
    handlePresentationIntentAbort,
    onPresentationIntentStart,
  } = submitPresentationRuntime;

  const submitReadModel = React.useMemo<Parameters<typeof useSearchSubmitOwner>[0]['readModel']>(
    () => ({
      query: rootPrimitivesRuntime.searchState.query,
      submittedQuery: rootSessionRuntime.resultsArrivalState.submittedQuery,
      hasResults: rootSessionRuntime.resultsArrivalState.hasResults,
      canLoadMore: rootSessionRuntime.resultsArrivalState.canLoadMore,
      currentPage: rootSessionRuntime.resultsArrivalState.currentPage,
      activeTab: rootPrimitivesRuntime.searchState.activeTab,
      currentResults: rootSessionRuntime.resultsArrivalState.currentResults,
      isPaginationExhausted: rootSessionRuntime.resultsArrivalState.isPaginationExhausted,
      pendingTabSwitchTab: rootSessionRuntime.resultsArrivalState.pendingTabSwitchTab,
      preferredActiveTab: rootPrimitivesRuntime.searchState.preferredActiveTab,
      hasActiveTabPreference: rootPrimitivesRuntime.searchState.hasActiveTabPreference,
      isLoadingMore: rootSessionRuntime.resultsArrivalState.isLoadingMore,
      openNow: rootSessionRuntime.filterStateRuntime.openNow,
      priceLevels: rootSessionRuntime.filterStateRuntime.priceLevels,
      votes100Plus: rootSessionRuntime.filterStateRuntime.votes100Plus,
      scoreMode: rootSessionRuntime.filterStateRuntime.scoreMode,
    }),
    [rootPrimitivesRuntime, rootSessionRuntime]
  );

  const submitUiPorts = React.useMemo<Parameters<typeof useSearchSubmitOwner>[0]['uiPorts']>(
    () => ({
      setActiveTab: rootPrimitivesRuntime.searchState.setActiveTab,
      setError: rootPrimitivesRuntime.searchState.setError,
      resetSheetToHidden: rootScaffoldRuntime.resultsSheetRuntimeOwner.resetResultsSheetToHidden,
      scrollResultsToTop: rootUiBridge.scrollResultsToTop,
      isSearchEditingRef: rootPrimitivesRuntime.searchState.isSearchEditingRef,
      resetMapMoveFlag: rootScaffoldRuntime.resultsSheetRuntimeLane.resetMapMoveFlag,
      loadRecentHistory: rootSessionRuntime.historyRuntime.loadRecentHistory,
      updateLocalRecentSearches: recentActivityRuntime.deferRecentSearchUpsert,
      getIsProfilePresentationActive: () =>
        profileOwnerRuntime.profileOwner.profileViewState.presentation.isPresentationActive,
      clearMapHighlightedRestaurantId:
        profileOwnerRuntime.profileOwner.profileActions.clearMapHighlightedRestaurantId,
      onPageOneResultsCommitted: handlePageOneResultsCommitted,
      onShortcutSearchCoverageSnapshot:
        rootSessionRuntime.primitives.handleShortcutSearchCoverageSnapshot,
      onPresentationIntentStart,
      onPresentationIntentAbort: handlePresentationIntentAbort,
    }),
    [
      handlePageOneResultsCommitted,
      handlePresentationIntentAbort,
      onPresentationIntentStart,
      profileOwnerRuntime.profileOwner.profileActions,
      profileOwnerRuntime.profileOwner.profileViewState.presentation.isPresentationActive,
      recentActivityRuntime,
      rootPrimitivesRuntime,
      rootScaffoldRuntime,
      rootSessionRuntime,
      rootUiBridge,
    ]
  );

  const submitRuntimePorts = React.useMemo<
    Parameters<typeof useSearchSubmitOwner>[0]['runtimePorts']
  >(
    () => ({
      runtimeWorkSchedulerRef: rootSessionRuntime.runtimeOwner.runtimeWorkSchedulerRef,
      searchRuntimeBus: rootSessionRuntime.runtimeOwner.searchRuntimeBus,
      lastSearchRequestIdRef: rootSessionRuntime.primitives.lastSearchRequestIdRef,
      lastAutoOpenKeyRef:
        rootSessionRuntime.runtimeOwner.overlayRuntimeController.lastAutoOpenKeyRef,
      runSearch: rootSessionRuntime.requestStatusRuntime.runSearch,
      mapRef: rootPrimitivesRuntime.mapState.mapRef,
      latestBoundsRef: rootSessionRuntime.runtimeOwner.latestBoundsRef,
      viewportBoundsService: rootSessionRuntime.runtimeOwner.viewportBoundsService,
      ensureUserLocation: rootSessionRuntime.runtimeOwner.ensureUserLocation,
      userLocationRef: rootSessionRuntime.runtimeOwner.userLocationRef,
      requestRuntimeOwner:
        requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
          .searchRequestRuntimeOwner,
      setSearchPerformed: rootPrimitivesRuntime.searchState.setSearchPerformed,
      setSearchMode: rootPrimitivesRuntime.searchState.setSearchMode,
      setSubmittedQuery: rootPrimitivesRuntime.searchState.setSubmittedQuery,
      setSearchError: rootPrimitivesRuntime.searchState.setSearchError,
      setPaginationError: rootPrimitivesRuntime.searchState.setPaginationError,
      setPaginationRetryToken: rootPrimitivesRuntime.searchState.setPaginationRetryToken,
      setShouldShowNoResults: rootPrimitivesRuntime.searchState.setShouldShowNoResults,
      setIsSearchLoading: rootPrimitivesRuntime.searchState.setIsSearchLoading,
      setIsLoadingMore: rootPrimitivesRuntime.searchState.setIsLoadingMore,
      setCurrentPage: rootPrimitivesRuntime.searchState.setCurrentPage,
      setCanLoadMore: rootPrimitivesRuntime.searchState.setCanLoadMore,
      setCurrentResults: rootPrimitivesRuntime.searchState.setCurrentResults,
      setRestaurantResults: rootPrimitivesRuntime.searchState.setRestaurantResults,
      setDishResults: rootPrimitivesRuntime.searchState.setDishResults,
      setHasResults: rootPrimitivesRuntime.searchState.setHasResults,
      setPendingTabSwitchTab: rootPrimitivesRuntime.searchState.setPendingTabSwitchTab,
      setIsPaginationExhausted: rootPrimitivesRuntime.searchState.setIsPaginationExhausted,
      setPaginationRequestId: rootPrimitivesRuntime.searchState.setPaginationRequestId,
    }),
    [requestLaneRuntime, rootPrimitivesRuntime, rootSessionRuntime]
  );

  const submitRuntimeResult: ReturnType<typeof useSearchSubmitOwner> = useSearchSubmitOwnerValue({
    readModel: submitReadModel,
    uiPorts: submitUiPorts,
    runtimePorts: submitRuntimePorts,
  });

  return {
    submitRuntimeResult,
  };
};
