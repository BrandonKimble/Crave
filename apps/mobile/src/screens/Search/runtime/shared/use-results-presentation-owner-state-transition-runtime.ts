import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import { useResultsPresentationOwnerCloseRuntime } from './use-results-presentation-owner-close-runtime';
import type { ResultsPresentationOwnerStateSessionRuntime } from './use-results-presentation-owner-state-session-runtime';

export type ResultsPresentationOwnerStateTransitionRuntime = {
  closeTransitionRuntime: ReturnType<typeof useResultsPresentationOwnerCloseRuntime>;
};

export const useResultsPresentationOwnerStateTransitionRuntime = ({
  clearSearchState,
  sessionRuntime,
  routeSceneVisibilityPolicyRuntime,
}: {
  clearSearchState: () => void;
  sessionRuntime: ResultsPresentationOwnerStateSessionRuntime;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
}): ResultsPresentationOwnerStateTransitionRuntime => {
  // S-C.5 item 2 (wrapper collapse): the pure re-lister owner-close-state-runtime is
  // deleted — its only move was picking these two fields off the session runtimes.
  // Leg 4: the dead close-search-cleanup runtime's arg fan (bus, request/autocomplete
  // cancels, input setters, inputRef) is gone with it — the close chain needs exactly
  // these three inputs.
  const closeTransitionRuntime = useResultsPresentationOwnerCloseRuntime({
    clearSearchState,
    shellLocalState: sessionRuntime.shellStateRuntime.shellLocalState,
    markSearchSheetCloseMapExitSettledRef:
      sessionRuntime.bridgeStateRuntime.markSearchSheetCloseMapExitSettledRef,
    routeSceneVisibilityPolicyRuntime,
  });

  return {
    closeTransitionRuntime,
  };
};
