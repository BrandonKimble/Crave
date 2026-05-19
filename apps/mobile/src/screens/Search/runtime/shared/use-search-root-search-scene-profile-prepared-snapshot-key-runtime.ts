import type { SearchRootProfilePresentationControlLane } from './use-search-root-control-plane-runtime-contract';

export const useSearchRootSearchSceneProfileSurfaceTransactionKeyRuntime = ({
  profilePresentationControlLane,
}: {
  profilePresentationControlLane: SearchRootProfilePresentationControlLane;
}): string | null =>
  profilePresentationControlLane.profileOwner.profileViewState.presentation.preparedSnapshotKey ??
  null;
