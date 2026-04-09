import React from 'react';

import type { SearchRouteOverlayResultsUiResetRuntime } from './searchRouteOverlayCommandRuntimeContract';

type UseSearchRouteOverlayResultsUiResetRuntimeArgs = {
  requestSearchHeaderActionFollowCollapse: () => void;
  setIsNavRestorePending: (next: React.SetStateAction<boolean>) => void;
  setPollsHeaderActionAnimationToken: (next: React.SetStateAction<number>) => void;
};

export const useSearchRouteOverlayResultsUiResetRuntime = ({
  requestSearchHeaderActionFollowCollapse,
  setIsNavRestorePending,
  setPollsHeaderActionAnimationToken,
}: UseSearchRouteOverlayResultsUiResetRuntimeArgs): SearchRouteOverlayResultsUiResetRuntime => {
  const handleCloseResultsUiReset = React.useCallback(() => {
    setIsNavRestorePending(true);
    requestSearchHeaderActionFollowCollapse();
    setPollsHeaderActionAnimationToken((current) => current + 1);
  }, [
    requestSearchHeaderActionFollowCollapse,
    setIsNavRestorePending,
    setPollsHeaderActionAnimationToken,
  ]);

  return React.useMemo(
    () => ({
      handleCloseResultsUiReset,
    }),
    [handleCloseResultsUiReset]
  );
};
