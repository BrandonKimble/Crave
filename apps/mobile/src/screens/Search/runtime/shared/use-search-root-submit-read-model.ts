import React from 'react';

import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

type SearchRootSubmitReadModel = Parameters<
  typeof import('../../hooks/use-search-submit-owner').default
>[0]['readModel'];

type UseSearchRootSubmitReadModelArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
};

export const useSearchRootSubmitReadModel = ({
  stateFoundationLane,
}: UseSearchRootSubmitReadModelArgs): SearchRootSubmitReadModel => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime } = stateFoundationLane;

  return React.useMemo(
    () => ({
      query: rootPrimitivesRuntime.searchState.query,
      submittedQuery: rootDataPlaneRuntime.resultsArrivalState.submittedQuery,
      hasResults: rootDataPlaneRuntime.resultsArrivalState.hasResults,
      canLoadMore: rootDataPlaneRuntime.resultsArrivalState.canLoadMore,
      currentPage: rootDataPlaneRuntime.resultsArrivalState.currentPage,
      activeTab: rootPrimitivesRuntime.searchState.activeTab,
      currentResults: rootDataPlaneRuntime.resultsArrivalState.currentResults,
      isPaginationExhausted: rootDataPlaneRuntime.resultsArrivalState.isPaginationExhausted,
      pendingTabSwitchTab: rootDataPlaneRuntime.resultsArrivalState.pendingTabSwitchTab,
      preferredActiveTab:
        rootPrimitivesRuntime.searchState.preferredActiveTab ??
        rootPrimitivesRuntime.searchState.activeTab,
      hasActiveTabPreference: rootPrimitivesRuntime.searchState.hasActiveTabPreference,
      isLoadingMore: rootDataPlaneRuntime.resultsArrivalState.isLoadingMore,
      openNow: rootDataPlaneRuntime.filterStateRuntime.openNow,
      priceLevels: rootDataPlaneRuntime.filterStateRuntime.priceLevels,
      votes100Plus: rootDataPlaneRuntime.filterStateRuntime.votes100Plus,
      risingActive: rootDataPlaneRuntime.filterStateRuntime.risingActive,
    }),
    [
      rootPrimitivesRuntime.searchState.activeTab,
      rootPrimitivesRuntime.searchState.hasActiveTabPreference,
      rootPrimitivesRuntime.searchState.preferredActiveTab,
      rootPrimitivesRuntime.searchState.query,
      rootDataPlaneRuntime.filterStateRuntime.openNow,
      rootDataPlaneRuntime.filterStateRuntime.priceLevels,
      rootDataPlaneRuntime.filterStateRuntime.votes100Plus,
      rootDataPlaneRuntime.filterStateRuntime.risingActive,
      rootDataPlaneRuntime.resultsArrivalState.canLoadMore,
      rootDataPlaneRuntime.resultsArrivalState.currentPage,
      rootDataPlaneRuntime.resultsArrivalState.currentResults,
      rootDataPlaneRuntime.resultsArrivalState.hasResults,
      rootDataPlaneRuntime.resultsArrivalState.isLoadingMore,
      rootDataPlaneRuntime.resultsArrivalState.isPaginationExhausted,
      rootDataPlaneRuntime.resultsArrivalState.pendingTabSwitchTab,
      rootDataPlaneRuntime.resultsArrivalState.submittedQuery,
    ]
  );
};
