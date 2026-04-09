import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

import { requestSearchRouteDockedRestore } from './searchRouteOverlayCommandStore';
import type {
  SearchRouteOverlayCommandActions,
  SearchRouteOverlayCommandState,
} from './searchRouteOverlayCommandRuntimeContract';
import { appOverlayRouteController } from './useAppOverlayRouteController';
import { useOverlaySheetPositionStore } from './useOverlaySheetPositionStore';
import type { OverlayKey, OverlaySheetSnap } from './types';

type UseSearchRoutePollsPanelActionsArgs = {
  rootOverlayKey: OverlayKey;
  commandState: SearchRouteOverlayCommandState;
  commandActions: SearchRouteOverlayCommandActions;
};

type PollsSnapMeta = { source: 'gesture' | 'programmatic' };

export const useSearchRoutePollsPanelActions = ({
  rootOverlayKey,
  commandState,
  commandActions,
}: UseSearchRoutePollsPanelActionsArgs) => {
  const handlePollsSnapStart = React.useCallback(
    (snap: OverlaySheetSnap) => {
      commandActions.setPollsSheetSnap(snap);
    },
    [commandActions]
  );

  const handlePollsSnapChange = React.useCallback(
    (snap: OverlaySheetSnap, meta?: PollsSnapMeta) => {
      commandActions.setPollsSheetSnap(snap);
      if (snap === 'collapsed') {
        commandActions.setDockedPollsRestoreInFlight(false);
      }
      if (
        commandState.pollsDockedSnapRequest &&
        commandState.pollsDockedSnapRequest.snap === snap
      ) {
        commandActions.setPollsDockedSnapRequest(null);
      }
      if (commandState.tabOverlaySnapRequest && commandState.tabOverlaySnapRequest === snap) {
        commandActions.setTabOverlaySnapRequest(null);
      }
      if (snap === 'hidden') {
        if (rootOverlayKey === 'search') {
          if (meta?.source !== 'gesture') {
            return;
          }
          if (
            commandState.dockedPollsRestoreInFlight ||
            commandState.pollsDockedSnapRequest?.snap === 'collapsed' ||
            Date.now() < commandState.ignoreDockedPollsHiddenUntilMs
          ) {
            return;
          }
          commandActions.setDockedPollsRestoreInFlight(false);
          commandActions.setPollsDockedSnapRequest(null);
          commandActions.setIsDockedPollsDismissed(true);
          return;
        }
        commandActions.setTabOverlaySnapRequest(null);
        if (rootOverlayKey === 'polls' && !commandState.overlaySwitchInFlight) {
          unstable_batchedUpdates(() => {
            requestSearchRouteDockedRestore({ snap: 'collapsed' });
            appOverlayRouteController.setRootRoute('search');
          });
        }
      }
    },
    [commandActions, commandState, rootOverlayKey]
  );

  const requestPollCreationExpand = React.useCallback(() => {
    if (commandState.pollsSheetSnap !== 'collapsed') {
      return;
    }
    const overlaySheetPositionState = useOverlaySheetPositionStore.getState();
    const desired = overlaySheetPositionState.hasUserSharedSnap
      ? overlaySheetPositionState.sharedSnap
      : 'expanded';
    commandActions.setPollCreationSnapRequest(desired);
  }, [commandActions, commandState.pollsSheetSnap]);

  const requestReturnToSearchFromPolls = React.useCallback(() => {
    unstable_batchedUpdates(() => {
      requestSearchRouteDockedRestore({ snap: 'collapsed' });
      appOverlayRouteController.setRootRoute('search');
    });
  }, []);

  return {
    handlePollsSnapStart,
    handlePollsSnapChange,
    requestPollCreationExpand,
    requestReturnToSearchFromPolls,
  };
};
