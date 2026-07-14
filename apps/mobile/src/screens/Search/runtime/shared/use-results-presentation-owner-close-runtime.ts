import type React from 'react';

import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import { useResultsPresentationCloseTransitionBridgeRuntime } from './use-results-presentation-close-transition-bridge-runtime';
import { useResultsPresentationCloseTransitionRuntime } from './use-results-presentation-close-transition-runtime';

type UseResultsPresentationOwnerCloseRuntimeArgs = {
  clearSearchState: () => void;
  shellLocalState: Parameters<
    typeof useResultsPresentationCloseTransitionRuntime
  >[0]['shellLocalState'];
  markSearchSheetCloseMapExitSettledRef: React.MutableRefObject<(requestKey: string) => void>;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
};

export const useResultsPresentationOwnerCloseRuntime = ({
  markSearchSheetCloseMapExitSettledRef,
  ...args
}: UseResultsPresentationOwnerCloseRuntimeArgs) => {
  const closeTransitionRuntime = useResultsPresentationCloseTransitionRuntime(args);

  useResultsPresentationCloseTransitionBridgeRuntime({
    markSearchSheetCloseMapExitSettledRef,
    closeTransitionActions: closeTransitionRuntime.closeTransitionActions,
  });

  return closeTransitionRuntime;
};
