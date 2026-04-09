import React from 'react';

import type { OverlaySheetSnap } from '../../../../overlays/types';

type UseSearchNavRestoreRuntimeArgs = {
  isNavRestorePending: boolean;
  isSearchOverlay: boolean;
  shouldShowDockedPollsTarget: boolean;
  pollsSheetSnap: OverlaySheetSnap;
  setIsNavRestorePending: (next: boolean) => void;
};

export const useSearchNavRestoreRuntime = ({
  isNavRestorePending,
  isSearchOverlay,
  shouldShowDockedPollsTarget,
  pollsSheetSnap,
  setIsNavRestorePending,
}: UseSearchNavRestoreRuntimeArgs): void => {
  React.useEffect(() => {
    if (!isNavRestorePending) {
      return;
    }
    if (!isSearchOverlay) {
      setIsNavRestorePending(false);
      return;
    }
    if (!shouldShowDockedPollsTarget) {
      return;
    }
    if (pollsSheetSnap === 'hidden') {
      return;
    }
    setIsNavRestorePending(false);
  }, [
    isNavRestorePending,
    isSearchOverlay,
    pollsSheetSnap,
    setIsNavRestorePending,
    shouldShowDockedPollsTarget,
  ]);
};
