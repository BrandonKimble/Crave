import type {
  SearchRootDataPlaneRuntime,
  SearchRootResultsArrivalState,
  SearchRootRuntimeFlagsRuntime,
} from '../shared/use-search-root-session-runtime-contract';

export const createSearchRootRuntimeFlagsValue = ({
  searchMode,
  isSearchSessionActive,
  searchSurfaceRedrawOperationId,
  isSearchLoading,
  isSearchRequestLoadingRef,
  setSearchRequestLoading,
  hydrationOperationId,
}: SearchRootRuntimeFlagsRuntime): SearchRootRuntimeFlagsRuntime => ({
  searchMode,
  isSearchSessionActive,
  searchSurfaceRedrawOperationId,
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
  restaurantResults,
  resultsRequestKey,
  submittedQuery,
  resultsPage,
});

export const createSearchRootDataPlaneRuntimeValue = ({
  resultsArrivalState,
  runtimeFlags,
  freezeGate,
  historyRuntime,
  filterStateRuntime,
  requestStatusRuntime,
}: SearchRootDataPlaneRuntime): SearchRootDataPlaneRuntime => ({
  resultsArrivalState,
  runtimeFlags,
  freezeGate,
  historyRuntime,
  filterStateRuntime,
  requestStatusRuntime,
});
