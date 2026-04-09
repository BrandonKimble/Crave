import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

import { requestSearchRouteDockedRestore } from './searchRouteOverlayCommandStore';
import type {
  SearchRouteOverlayCommandActions,
  SearchRouteOverlayCommandState,
} from './searchRouteOverlayCommandRuntimeContract';
import { appOverlayRouteController } from './useAppOverlayRouteController';
import type { SearchRouteTabPanelRuntimeModel } from './useSearchRouteTabPanelRuntime';
import { useProfilePanelSpec } from './panels/ProfilePanel';
import type { OverlayContentSpec } from './types';
import type { OverlayKey, OverlaySheetSnap, OverlaySheetSnapRequest } from './types';

type UseSearchRouteProfilePanelSpecArgs = {
  rootOverlayKey: OverlayKey;
  tabPanelRuntime: SearchRouteTabPanelRuntimeModel;
  commandState: SearchRouteOverlayCommandState;
  commandActions: SearchRouteOverlayCommandActions;
};

const buildShellSnapRequest = (
  snap: OverlaySheetSnap | null | undefined
): OverlaySheetSnapRequest | null => (snap ? { snap, token: null } : null);

export const useSearchRouteProfilePanelSpec = ({
  rootOverlayKey,
  tabPanelRuntime,
  commandState,
  commandActions,
}: UseSearchRouteProfilePanelSpecArgs): OverlayContentSpec<unknown> | null => {
  const handleProfileSnapStart = React.useCallback(
    (snap: OverlaySheetSnap) => {
      commandActions.setProfileSheetSnap(snap);
    },
    [commandActions]
  );

  const handleProfileSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      commandActions.setProfileSheetSnap(snap);
      if (commandState.tabOverlaySnapRequest && commandState.tabOverlaySnapRequest === snap) {
        commandActions.setTabOverlaySnapRequest(null);
      }
      if (
        snap === 'hidden' &&
        rootOverlayKey === 'profile' &&
        !commandState.overlaySwitchInFlight
      ) {
        commandActions.setTabOverlaySnapRequest(null);
        unstable_batchedUpdates(() => {
          requestSearchRouteDockedRestore({ snap: 'collapsed' });
          appOverlayRouteController.setRootRoute('search');
        });
      }
    },
    [
      commandActions,
      commandState.overlaySwitchInFlight,
      commandState.tabOverlaySnapRequest,
      rootOverlayKey,
    ]
  );

  const profilePanelSpec = useProfilePanelSpec({
    visible: tabPanelRuntime.showProfileOverlay,
    navBarTop: tabPanelRuntime.navBarTop,
    searchBarTop: tabPanelRuntime.searchBarTop,
    snapPoints: tabPanelRuntime.snapPoints,
    sheetY: tabPanelRuntime.sheetY,
    headerActionProgress: tabPanelRuntime.headerActionProgress,
    onSnapStart: handleProfileSnapStart,
    onSnapChange: handleProfileSnapChange,
    shellSnapRequest: buildShellSnapRequest(
      commandState.tabOverlaySnapRequest === 'hidden' ? null : commandState.tabOverlaySnapRequest
    ),
  });

  return profilePanelSpec;
};
