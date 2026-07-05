import React from 'react';

import { createSearchRootResultsArrivalStateValue } from '../controller/search-root-data-plane-runtime';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import type {
  SearchRootResultsArrivalState,
  SearchRootSessionCoreLane,
} from './use-search-root-session-runtime-contract';

type UseSearchRootResultsArrivalRuntimeArgs = {
  rootSessionCoreLane: Pick<SearchRootSessionCoreLane, 'searchRuntimeBus'>;
};

const hasVisibleSearchResultsSurface = ({
  resultsRequestKey,
  resultsIdentityCandidateKey,
  resultsDishCount,
  resultsRestaurantCount,
}: {
  resultsRequestKey: string | null;
  resultsIdentityCandidateKey: string | null;
  resultsDishCount: number;
  resultsRestaurantCount: number;
}): boolean =>
  resultsRequestKey != null ||
  resultsIdentityCandidateKey != null ||
  resultsDishCount > 0 ||
  resultsRestaurantCount > 0;

export const useSearchRootResultsArrivalRuntime = ({
  rootSessionCoreLane,
}: UseSearchRootResultsArrivalRuntimeArgs): SearchRootResultsArrivalState => {
  const { searchRuntimeBus } = rootSessionCoreLane;
  const resultsArrivalScalarState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      isLoadingMore: state.isLoadingMore,
      canLoadMore: state.canLoadMore,
      currentPage: state.currentPage,
      isPaginationExhausted: state.isPaginationExhausted,
      pendingTabSwitchTab: state.pendingTabSwitchTab,
      resultsRequestKey: state.resultsRequestKey,
      resultsIdentityCandidateKey: state.resultsIdentityCandidateKey,
      resultsDishCount: state.resultsDishCount,
      resultsRestaurantCount: state.resultsRestaurantCount,
      resultsPage: state.resultsPage,
      submittedQuery: state.submittedQuery,
    }),
    (a, b) =>
      a.isLoadingMore === b.isLoadingMore &&
      a.canLoadMore === b.canLoadMore &&
      a.currentPage === b.currentPage &&
      a.isPaginationExhausted === b.isPaginationExhausted &&
      a.pendingTabSwitchTab === b.pendingTabSwitchTab &&
      a.resultsRequestKey === b.resultsRequestKey &&
      a.resultsIdentityCandidateKey === b.resultsIdentityCandidateKey &&
      a.resultsDishCount === b.resultsDishCount &&
      a.resultsRestaurantCount === b.resultsRestaurantCount &&
      a.resultsPage === b.resultsPage &&
      a.submittedQuery === b.submittedQuery,
    [
      'isLoadingMore',
      'canLoadMore',
      'currentPage',
      'isPaginationExhausted',
      'pendingTabSwitchTab',
      'resultsRequestKey',
      'resultsIdentityCandidateKey',
      'resultsDishCount',
      'resultsRestaurantCount',
      'resultsPage',
      'submittedQuery',
    ] as const,
    'root_results_arrival_runtime'
  );
  return React.useMemo(() => {
    return createSearchRootResultsArrivalStateValue({
      currentResults: null,
      hasResults: hasVisibleSearchResultsSurface({
        resultsRequestKey: resultsArrivalScalarState.resultsRequestKey,
        resultsIdentityCandidateKey: resultsArrivalScalarState.resultsIdentityCandidateKey,
        resultsDishCount: resultsArrivalScalarState.resultsDishCount,
        resultsRestaurantCount: resultsArrivalScalarState.resultsRestaurantCount,
      }),
      isLoadingMore: resultsArrivalScalarState.isLoadingMore,
      canLoadMore: resultsArrivalScalarState.canLoadMore,
      currentPage: resultsArrivalScalarState.currentPage,
      isPaginationExhausted: resultsArrivalScalarState.isPaginationExhausted,
      pendingTabSwitchTab: resultsArrivalScalarState.pendingTabSwitchTab,
      restaurantResults: null,
      resultsRequestKey: resultsArrivalScalarState.resultsRequestKey,
      submittedQuery: resultsArrivalScalarState.submittedQuery,
      resultsPage: resultsArrivalScalarState.resultsPage,
    });
  }, [
    resultsArrivalScalarState.canLoadMore,
    resultsArrivalScalarState.currentPage,
    resultsArrivalScalarState.isLoadingMore,
    resultsArrivalScalarState.isPaginationExhausted,
    resultsArrivalScalarState.pendingTabSwitchTab,
    resultsArrivalScalarState.resultsDishCount,
    resultsArrivalScalarState.resultsIdentityCandidateKey,
    resultsArrivalScalarState.resultsRestaurantCount,
    resultsArrivalScalarState.resultsPage,
    resultsArrivalScalarState.resultsRequestKey,
    resultsArrivalScalarState.submittedQuery,
  ]);
};
