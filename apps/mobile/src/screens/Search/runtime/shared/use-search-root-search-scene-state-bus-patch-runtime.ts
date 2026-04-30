import type {
  SearchRootPreparedResultsSnapshotControlLane,
  SearchRootProfilePresentationControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootSearchSceneBusPatch } from './use-search-root-search-scene-bus-patch-runtime';
import { useSearchRootSearchSceneHydrationOperationBusPatchRuntime } from './use-search-root-search-scene-hydration-operation-bus-patch-runtime';
import { useSearchRootSearchScenePreparedSnapshotBusPatchRuntime } from './use-search-root-search-scene-prepared-snapshot-bus-patch-runtime';

export const useSearchRootSearchSceneStateBusPatchRuntime = ({
  stateFoundationLane,
  profilePresentationControlLane,
  preparedResultsSnapshotControlLane,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
  profilePresentationControlLane: SearchRootProfilePresentationControlLane;
  preparedResultsSnapshotControlLane: SearchRootPreparedResultsSnapshotControlLane;
}): Pick<
  SearchRootSearchSceneBusPatch,
  'hydrationOperationId' | 'preparedPresentationSnapshotKey'
> => ({
  ...useSearchRootSearchSceneHydrationOperationBusPatchRuntime({
    stateFoundationLane,
  }),
  ...useSearchRootSearchScenePreparedSnapshotBusPatchRuntime({
    profilePresentationControlLane,
    preparedResultsSnapshotControlLane,
  }),
});
