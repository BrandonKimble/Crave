import type {
  SearchRootSearchSurfaceResultsTransactionControlLane,
  SearchRootResultsPresentationStateControlLane,
  SearchRootResultsSheetControlLane,
  SearchRootResultsTransitionControlLane,
} from '../shared/use-search-root-control-plane-runtime-contract';

export type SearchRootResultsControlRuntimeValue = {
  resultsSheetControlLane: SearchRootResultsSheetControlLane;
  resultsPresentationStateControlLane: SearchRootResultsPresentationStateControlLane;
  resultsTransitionControlLane: SearchRootResultsTransitionControlLane;
  searchSurfaceResultsTransactionControlLane: SearchRootSearchSurfaceResultsTransactionControlLane;
};
