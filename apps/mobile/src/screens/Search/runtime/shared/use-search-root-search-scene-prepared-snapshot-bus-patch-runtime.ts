import React from 'react';

import type {
  SearchRootPreparedResultsSnapshotControlLane,
  SearchRootProfilePresentationControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSearchSceneBusPatch } from './use-search-root-search-scene-bus-patch-runtime';
import { useSearchRootSearchSceneProfilePreparedSnapshotKeyRuntime } from './use-search-root-search-scene-profile-prepared-snapshot-key-runtime';
import { useSearchRootSearchSceneResultsPreparedSnapshotKeyRuntime } from './use-search-root-search-scene-results-prepared-snapshot-key-runtime';

export const useSearchRootSearchScenePreparedSnapshotBusPatchRuntime = ({
  profilePresentationControlLane,
  preparedResultsSnapshotControlLane,
}: {
  profilePresentationControlLane: SearchRootProfilePresentationControlLane;
  preparedResultsSnapshotControlLane: SearchRootPreparedResultsSnapshotControlLane;
}): Pick<SearchRootSearchSceneBusPatch, 'preparedPresentationSnapshotKey'> => {
  const profilePreparedSnapshotKey =
    useSearchRootSearchSceneProfilePreparedSnapshotKeyRuntime({
      profilePresentationControlLane,
    });
  const resultsPreparedSnapshotKey =
    useSearchRootSearchSceneResultsPreparedSnapshotKeyRuntime({
      preparedResultsSnapshotControlLane,
    });

  return React.useMemo(
    () => ({
      preparedPresentationSnapshotKey:
        profilePreparedSnapshotKey ?? resultsPreparedSnapshotKey,
    }),
    [profilePreparedSnapshotKey, resultsPreparedSnapshotKey]
  );
};
