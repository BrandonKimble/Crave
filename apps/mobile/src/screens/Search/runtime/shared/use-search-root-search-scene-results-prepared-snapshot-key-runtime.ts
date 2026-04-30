import type { SearchRootPreparedResultsSnapshotControlLane } from './use-search-root-control-plane-runtime-contract';

export const useSearchRootSearchSceneResultsPreparedSnapshotKeyRuntime = ({
  preparedResultsSnapshotControlLane,
}: {
  preparedResultsSnapshotControlLane: SearchRootPreparedResultsSnapshotControlLane;
}): string | null =>
  preparedResultsSnapshotControlLane.preparedResultsSnapshotKey;
