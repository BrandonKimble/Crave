import React from 'react';

import type { OverlaySheetSnap } from './types';
import { useSearchRouteOverlayCommandActions } from './useSearchRouteOverlayCommandActions';
import { useSearchRouteOverlayCommandState } from './useSearchRouteOverlayCommandState';
import { useSearchRouteOverlayDockedPollsRestoreRuntime } from './useSearchRouteOverlayDockedPollsRestoreRuntime';
import { useSearchRouteOverlayResultsUiResetRuntime } from './useSearchRouteOverlayResultsUiResetRuntime';
import { useSearchRouteOverlaySaveSheetRuntime } from './useSearchRouteOverlaySaveSheetRuntime';

type UseSearchRouteOverlayCommandRuntimeArgs = {
  hasUserSharedSnap: boolean;
  sharedSnap: Exclude<OverlaySheetSnap, 'hidden' | 'collapsed'>;
};

export const useSearchRouteOverlayCommandRuntime = ({
  hasUserSharedSnap,
  sharedSnap,
}: UseSearchRouteOverlayCommandRuntimeArgs) => {
  const commandState = useSearchRouteOverlayCommandState();
  const commandActions = useSearchRouteOverlayCommandActions();

  const { restoreDockedPolls } = useSearchRouteOverlayDockedPollsRestoreRuntime({
    pollsSheetSnap: commandState.pollsSheetSnap,
    isDockedPollsDismissed: commandState.isDockedPollsDismissed,
    hasUserSharedSnap,
    sharedSnap,
    setTabOverlaySnapRequest: commandActions.setTabOverlaySnapRequest,
  });

  const saveSheetRuntime = useSearchRouteOverlaySaveSheetRuntime({
    saveSheetState: commandState.saveSheetState,
    setSaveSheetState: commandActions.setSaveSheetState,
  });

  const { handleCloseResultsUiReset } = useSearchRouteOverlayResultsUiResetRuntime({
    requestSearchHeaderActionFollowCollapse: commandActions.requestSearchHeaderActionFollowCollapse,
    setIsNavRestorePending: commandActions.setIsNavRestorePending,
    setPollsHeaderActionAnimationToken: commandActions.setPollsHeaderActionAnimationToken,
  });

  return React.useMemo(
    () => ({
      commandState,
      commandActions,
      restoreDockedPolls,
      handleCloseResultsUiReset,
      ...saveSheetRuntime,
    }),
    [commandActions, commandState, handleCloseResultsUiReset, restoreDockedPolls, saveSheetRuntime]
  );
};
