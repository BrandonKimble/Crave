import type {
  SearchRootPreparedResultsSnapshotControlLane,
  SearchRootResultsPresentationStateControlLane,
  SearchRootResultsSheetControlLane,
  SearchRootResultsTransitionControlLane,
} from '../shared/use-search-root-control-plane-runtime-contract';

export type SearchRootResultsControlRuntimeValue = {
  resultsSheetControlLane: SearchRootResultsSheetControlLane;
  resultsPresentationStateControlLane: SearchRootResultsPresentationStateControlLane;
  resultsTransitionControlLane: SearchRootResultsTransitionControlLane;
  preparedResultsSnapshotControlLane: SearchRootPreparedResultsSnapshotControlLane;
};

export const createSearchRootResultsControlRuntimeValue = ({
  resultsSheetControlLane,
  resultsPresentationStateControlLane,
  resultsTransitionControlLane,
  preparedResultsSnapshotControlLane,
}: SearchRootResultsControlRuntimeValue): SearchRootResultsControlRuntimeValue => ({
  resultsSheetControlLane,
  resultsPresentationStateControlLane,
  resultsTransitionControlLane,
  preparedResultsSnapshotControlLane,
});
