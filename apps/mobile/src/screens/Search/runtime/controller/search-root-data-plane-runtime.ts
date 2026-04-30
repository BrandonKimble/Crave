import type {
  SearchRootDataPlaneRuntime,
  SearchRootHydrationRuntimeState,
  SearchRootResultsArrivalState,
  SearchRootRuntimeFlagsRuntime,
} from '../shared/use-search-root-session-runtime-contract';

export const createSearchRootRuntimeFlagsValue = ({
  searchMode,
  isSearchSessionActive,
  runOneHandoffOperationId,
  setSearchMode,
  setIsSearchSessionActive,
  isSearchLoading,
  isSearchRequestLoadingRef,
  setSearchRequestLoading,
  hydrationOperationId,
}: SearchRootRuntimeFlagsRuntime): SearchRootRuntimeFlagsRuntime => ({
  searchMode,
  isSearchSessionActive,
  runOneHandoffOperationId,
  setSearchMode,
  setIsSearchSessionActive,
  isSearchLoading,
  isSearchRequestLoadingRef,
  setSearchRequestLoading,
  hydrationOperationId,
});

export const createSearchRootResultsArrivalStateValue = ({
  currentResults,
  hasResults,
  isLoadingMore,
  canLoadMore,
  currentPage,
  isPaginationExhausted,
  pendingTabSwitchTab,
  restaurantResults,
  resultsRequestKey,
  submittedQuery,
  resultsPage,
}: SearchRootResultsArrivalState): SearchRootResultsArrivalState => ({
  currentResults,
  hasResults,
  isLoadingMore,
  canLoadMore,
  currentPage,
  isPaginationExhausted,
  pendingTabSwitchTab,
  restaurantResults,
  resultsRequestKey,
  submittedQuery,
  resultsPage,
});

export const createSearchRootHydrationRuntimeStateValue = ({
  resultsHydrationKey,
  hydratedResultsKey,
}: SearchRootHydrationRuntimeState): SearchRootHydrationRuntimeState => ({
  resultsHydrationKey,
  hydratedResultsKey,
});

export const createSearchRootDataPlaneRuntimeValue = ({
  resultsArrivalState,
  runtimeFlags,
  freezeGate,
  hydrationRuntimeState,
  historyRuntime,
  filterStateRuntime,
  requestStatusRuntime,
}: SearchRootDataPlaneRuntime): SearchRootDataPlaneRuntime => ({
  resultsArrivalState,
  runtimeFlags,
  freezeGate,
  hydrationRuntimeState,
  historyRuntime,
  filterStateRuntime,
  requestStatusRuntime,
});
