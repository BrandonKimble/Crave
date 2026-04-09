import { useSearchBus } from './search-runtime-bus';
import type { SearchResultsPanelResultsRuntimeState } from './search-results-panel-runtime-state-contract';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

export const useSearchResultsPanelResultsRuntimeState =
  (): SearchResultsPanelResultsRuntimeState => {
    const searchRuntimeBus = useSearchBus();

    return useSearchRuntimeBusSelector(
      searchRuntimeBus,
      (state) => ({
        results: state.results as SearchResultsPanelResultsRuntimeState['results'],
        activeTab: state.activeTab,
        pendingTabSwitchTab: state.pendingTabSwitchTab,
        canLoadMore: state.canLoadMore,
        isSearchLoading: state.isSearchLoading,
        isLoadingMore: state.isLoadingMore,
        submittedQuery: state.submittedQuery,
      }),
      (left, right) =>
        left.results === right.results &&
        left.activeTab === right.activeTab &&
        left.pendingTabSwitchTab === right.pendingTabSwitchTab &&
        left.canLoadMore === right.canLoadMore &&
        left.isSearchLoading === right.isSearchLoading &&
        left.isLoadingMore === right.isLoadingMore &&
        left.submittedQuery === right.submittedQuery,
      [
        'results',
        'activeTab',
        'pendingTabSwitchTab',
        'canLoadMore',
        'isSearchLoading',
        'isLoadingMore',
        'submittedQuery',
      ] as const
    );
  };
