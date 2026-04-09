import React from 'react';

import { requestSearchRouteDockedRestore } from './searchRouteOverlayCommandStore';
import type { SearchRouteOverlayDockedPollsRestoreRuntime } from './searchRouteOverlayCommandRuntimeContract';
import type { OverlaySheetSnap } from './types';

type UseSearchRouteOverlayDockedPollsRestoreRuntimeArgs = {
  pollsSheetSnap: OverlaySheetSnap;
  isDockedPollsDismissed: boolean;
  hasUserSharedSnap: boolean;
  sharedSnap: Exclude<OverlaySheetSnap, 'hidden' | 'collapsed'>;
  setTabOverlaySnapRequest: (
    next: React.SetStateAction<Exclude<OverlaySheetSnap, 'hidden'> | null>
  ) => void;
};

export const useSearchRouteOverlayDockedPollsRestoreRuntime = ({
  pollsSheetSnap,
  isDockedPollsDismissed,
  hasUserSharedSnap,
  sharedSnap,
  setTabOverlaySnapRequest,
}: UseSearchRouteOverlayDockedPollsRestoreRuntimeArgs): SearchRouteOverlayDockedPollsRestoreRuntime => {
  const requestDockedPollsRestore = React.useCallback(
    (snap?: Exclude<OverlaySheetSnap, 'hidden'>) => {
      requestSearchRouteDockedRestore({
        snap,
        pollsSheetSnap,
        isDockedPollsDismissed,
        hasUserSharedSnap,
        sharedSnap,
      });
    },
    [hasUserSharedSnap, isDockedPollsDismissed, pollsSheetSnap, sharedSnap]
  );
  const restoreDockedPolls = React.useCallback(
    ({
      snap,
      clearTabSnapRequest = false,
    }: {
      snap?: Exclude<OverlaySheetSnap, 'hidden'>;
      clearTabSnapRequest?: boolean;
    } = {}) => {
      if (clearTabSnapRequest) {
        setTabOverlaySnapRequest(null);
      }
      requestDockedPollsRestore(snap);
    },
    [requestDockedPollsRestore, setTabOverlaySnapRequest]
  );

  return React.useMemo(
    () => ({
      requestDockedPollsRestore,
      restoreDockedPolls,
    }),
    [requestDockedPollsRestore, restoreDockedPolls]
  );
};
