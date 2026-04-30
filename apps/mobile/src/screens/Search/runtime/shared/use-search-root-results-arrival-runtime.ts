import React from 'react';

import type { SearchResponse } from '../../../../types';
import {
  createSearchRootResultsArrivalStateValue,
} from '../controller/search-root-data-plane-runtime';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import type {
  SearchRootResultsArrivalState,
  SearchRootSessionCoreLane,
} from './use-search-root-session-runtime-contract';

const resolveResultsPage = (response: SearchResponse | null): number | null => {
  if (!response) {
    return null;
  }
  const page = response.metadata?.page;
  if (typeof page === 'number' && Number.isFinite(page) && page > 0) {
    return page;
  }
  return 1;
};

type UseSearchRootResultsArrivalRuntimeArgs = {
  rootSessionCoreLane: Pick<SearchRootSessionCoreLane, 'searchRuntimeBus'>;
};

export const useSearchRootResultsArrivalRuntime = ({
  rootSessionCoreLane,
}: UseSearchRootResultsArrivalRuntimeArgs): SearchRootResultsArrivalState => {
  const { searchRuntimeBus } = rootSessionCoreLane;
  const resultsArrivalState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) =>
      createSearchRootResultsArrivalStateValue({
        currentResults: state.results,
        hasResults: state.results != null,
        isLoadingMore: state.isLoadingMore,
        canLoadMore: state.canLoadMore,
        currentPage: state.currentPage,
        isPaginationExhausted: state.isPaginationExhausted,
        pendingTabSwitchTab: state.pendingTabSwitchTab,
        restaurantResults: (state.results?.restaurants ?? null) as
          | SearchResponse['restaurants']
          | null,
        resultsRequestKey: state.resultsRequestKey,
        submittedQuery: state.submittedQuery,
        resultsPage: resolveResultsPage(state.results),
      }),
    (a, b) =>
      a.currentResults === b.currentResults &&
      a.hasResults === b.hasResults &&
      a.isLoadingMore === b.isLoadingMore &&
      a.canLoadMore === b.canLoadMore &&
      a.currentPage === b.currentPage &&
      a.isPaginationExhausted === b.isPaginationExhausted &&
      a.pendingTabSwitchTab === b.pendingTabSwitchTab &&
      a.restaurantResults === b.restaurantResults &&
      a.resultsRequestKey === b.resultsRequestKey &&
      a.submittedQuery === b.submittedQuery &&
      a.resultsPage === b.resultsPage,
    [
      'results',
      'isLoadingMore',
      'canLoadMore',
      'currentPage',
      'isPaginationExhausted',
      'pendingTabSwitchTab',
      'resultsRequestKey',
      'submittedQuery',
    ] as const
  );

  return React.useMemo(() => resultsArrivalState, [resultsArrivalState]);
};
