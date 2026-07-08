import type { SearchRuntimeBus } from './search-runtime-bus';
import { selectSearchMode, selectSubmittedQuery } from './search-desired-tuple-selectors';
import type { SearchResultsPanelResultsRuntimeState } from './search-results-panel-runtime-state-contract';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

export const useSearchResultsPanelResultsRuntimeState = (
  searchRuntimeBus: SearchRuntimeBus
): SearchResultsPanelResultsRuntimeState => {
  return useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      results: null,
      resultsRequestKey: state.resultsRequestKey,
      resultsIdentityCandidateKey: state.resultsIdentityCandidateKey,
      resultsPage: state.resultsPage,
      resultsDishCount: state.resultsDishCount,
      resultsRestaurantCount: state.resultsRestaurantCount,
      activeTab: state.activeTab,
      desiredTab: state.desiredTuple.tab,
      canLoadMore: state.canLoadMore,
      isSearchLoading: state.isSearchLoading,
      isLoadingMore: state.isLoadingMore,
      submittedQuery: selectSubmittedQuery(state),
      searchMode: selectSearchMode(state),
    }),
    (left, right) =>
      left.resultsRequestKey === right.resultsRequestKey &&
      left.resultsIdentityCandidateKey === right.resultsIdentityCandidateKey &&
      left.resultsPage === right.resultsPage &&
      left.resultsDishCount === right.resultsDishCount &&
      left.resultsRestaurantCount === right.resultsRestaurantCount &&
      left.activeTab === right.activeTab &&
      left.desiredTab === right.desiredTab &&
      left.canLoadMore === right.canLoadMore &&
      left.isSearchLoading === right.isSearchLoading &&
      left.isLoadingMore === right.isLoadingMore &&
      left.submittedQuery === right.submittedQuery &&
      left.searchMode === right.searchMode,
    [
      'resultsRequestKey',
      'resultsIdentityCandidateKey',
      'resultsPage',
      'resultsDishCount',
      'resultsRestaurantCount',
      'activeTab',
      'canLoadMore',
      'isSearchLoading',
      'isLoadingMore',
      'desiredTuple',
    ] as const,
    'results_panel_results_runtime_state'
  );
};
