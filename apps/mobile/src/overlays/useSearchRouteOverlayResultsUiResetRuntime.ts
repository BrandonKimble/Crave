import React from 'react';

import type { SearchRouteOverlayResultsUiResetRuntime } from './searchRouteOverlayCommandRuntimeContract';
import type { SearchRouteOverlayTransitionController } from './useSearchRouteOverlayTransitionController';

type UseSearchRouteOverlayResultsUiResetRuntimeArgs = {
  requestSearchHeaderActionFollowCollapse: () => void;
  transitionController: SearchRouteOverlayTransitionController;
  setPollsHeaderActionAnimationToken: (next: React.SetStateAction<number>) => void;
};

export const useSearchRouteOverlayResultsUiResetRuntime = ({
  requestSearchHeaderActionFollowCollapse,
  transitionController,
  setPollsHeaderActionAnimationToken,
}: UseSearchRouteOverlayResultsUiResetRuntimeArgs): SearchRouteOverlayResultsUiResetRuntime => {
  const handleCloseResultsUiReset = React.useCallback(() => {
    transitionController.setNavRestorePending(true);
    requestSearchHeaderActionFollowCollapse();
    setPollsHeaderActionAnimationToken((current) => current + 1);
  }, [
    requestSearchHeaderActionFollowCollapse,
    setPollsHeaderActionAnimationToken,
    transitionController,
  ]);

  return React.useMemo(
    () => ({
      handleCloseResultsUiReset,
    }),
    [handleCloseResultsUiReset]
  );
};
