import type { SearchRuntimeBus } from './search-runtime-bus';
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
      resultsHydrationCandidateKey: state.resultsHydrationCandidateKey,
      resultsPage: state.resultsPage,
      resultsDishCount: state.resultsDishCount,
      resultsRestaurantCount: state.resultsRestaurantCount,
      activeTab: state.activeTab,
      pendingTabSwitchTab: state.pendingTabSwitchTab,
      canLoadMore: state.canLoadMore,
      isSearchLoading: state.isSearchLoading,
      isLoadingMore: state.isLoadingMore,
      submittedQuery: state.submittedQuery,
    }),
    (left, right) =>
      left.resultsRequestKey === right.resultsRequestKey &&
      left.resultsHydrationCandidateKey === right.resultsHydrationCandidateKey &&
      left.resultsPage === right.resultsPage &&
      left.resultsDishCount === right.resultsDishCount &&
      left.resultsRestaurantCount === right.resultsRestaurantCount &&
      left.activeTab === right.activeTab &&
      left.pendingTabSwitchTab === right.pendingTabSwitchTab &&
      left.canLoadMore === right.canLoadMore &&
      left.isSearchLoading === right.isSearchLoading &&
      left.isLoadingMore === right.isLoadingMore &&
      left.submittedQuery === right.submittedQuery,
    [
      'resultsRequestKey',
      'resultsHydrationCandidateKey',
      'resultsPage',
      'resultsDishCount',
      'resultsRestaurantCount',
      'activeTab',
      'pendingTabSwitchTab',
      'canLoadMore',
      'isSearchLoading',
      'isLoadingMore',
      'submittedQuery',
    ] as const,
    'results_panel_results_runtime_state'
  );
};
