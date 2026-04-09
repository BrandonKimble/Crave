import React from 'react';

import {
  requestSearchRouteDockedRestore,
  useSearchRouteOverlayCommandStore,
} from '../../../../overlays/searchRouteOverlayCommandStore';
import { appOverlayRouteController } from '../../../../overlays/useAppOverlayRouteController';
import { useOverlayStore } from '../../../../store/overlayStore';
import type { ProfileForegroundUiRestoreState } from './profile-transition-state-contract';

export type ProfileAppForegroundExecutionArgs = {
  dismissSearchInteractionUi: () => void;
  ensureInitialCameraReady: () => void;
};

export type ProfileAppForegroundExecutionRuntime = {
  prepareForegroundUiForProfileOpen: (options?: {
    captureSaveSheetState?: boolean;
  }) => ProfileForegroundUiRestoreState | null;
};

type UseProfileAppForegroundExecutionRuntimeArgs = {
  foregroundExecutionArgs: ProfileAppForegroundExecutionArgs;
};

export const useProfileAppForegroundExecutionRuntime = ({
  foregroundExecutionArgs,
}: UseProfileAppForegroundExecutionRuntimeArgs): ProfileAppForegroundExecutionRuntime => {
  const { dismissSearchInteractionUi, ensureInitialCameraReady } = foregroundExecutionArgs;

  const prepareForegroundUiForProfileOpen = React.useCallback(
    (options?: { captureSaveSheetState?: boolean }) => {
      const overlayState = useOverlayStore.getState();
      const rootOverlay =
        overlayState.overlayRouteStack[0]?.key ?? overlayState.activeOverlayRoute.key;
      if (rootOverlay !== 'search') {
        useSearchRouteOverlayCommandStore.getState().setTabOverlaySnapRequest(null);
        requestSearchRouteDockedRestore({
          snap: 'collapsed',
        });
        appOverlayRouteController.setRootRoute('search');
      } else if (overlayState.activeOverlayRoute.key !== 'search') {
        appOverlayRouteController.popToRootRoute();
      }
      useOverlayStore.getState().dismissTransientOverlays();
      dismissSearchInteractionUi();
      ensureInitialCameraReady();
      const { saveSheetState, setSaveSheetState } = useSearchRouteOverlayCommandStore.getState();
      if (options?.captureSaveSheetState && saveSheetState.visible) {
        const previousSaveSheetState = saveSheetState;
        setSaveSheetState((prev) => ({ ...prev, visible: false }));
        return previousSaveSheetState;
      }
      return null;
    },
    [dismissSearchInteractionUi, ensureInitialCameraReady]
  );

  return React.useMemo<ProfileAppForegroundExecutionRuntime>(
    () => ({
      prepareForegroundUiForProfileOpen,
    }),
    [prepareForegroundUiForProfileOpen]
  );
};
