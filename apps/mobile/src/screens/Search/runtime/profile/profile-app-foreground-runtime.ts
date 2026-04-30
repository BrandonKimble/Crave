import React from 'react';

import type {
  AppRouteOverlayCommandActions,
  AppRouteOverlayCommandAuthority,
} from '../../../../navigation/runtime/app-route-overlay-command-controller';
import type { AppSearchRouteCommandActions } from '../../../../navigation/runtime/app-search-route-command-runtime';
import { dismissTransientOverlays } from '../../../../overlays/overlayTransientDismissorRuntime';
import type { ProfileAppForegroundExecutionRuntime } from '../../../../navigation/runtime/app-route-profile-app-execution-runtime-contract';

export type ProfileAppForegroundExecutionArgs = {
  dismissSearchInteractionUi: () => void;
  ensureInitialCameraReady: () => void;
};

type UseProfileAppForegroundExecutionRuntimeArgs = {
  routeOverlayCommandActions: AppRouteOverlayCommandActions;
  routeOverlayCommandAuthority: AppRouteOverlayCommandAuthority;
  routeSearchCommandActions: AppSearchRouteCommandActions;
  foregroundExecutionArgs: ProfileAppForegroundExecutionArgs;
};

export const useProfileAppForegroundExecutionRuntime = ({
  routeOverlayCommandActions,
  routeOverlayCommandAuthority,
  routeSearchCommandActions,
  foregroundExecutionArgs,
}: UseProfileAppForegroundExecutionRuntimeArgs): ProfileAppForegroundExecutionRuntime => {
  const { dismissSearchInteractionUi, ensureInitialCameraReady } = foregroundExecutionArgs;

  const prepareForegroundUiForProfileOpen = React.useCallback(
    (options?: { captureSaveSheetState?: boolean }) => {
      routeSearchCommandActions.ensureAppSearchRouteSearchScene();
      dismissTransientOverlays();
      dismissSearchInteractionUi();
      ensureInitialCameraReady();
      const { saveSheetState } = routeOverlayCommandAuthority.getSnapshot();
      if (options?.captureSaveSheetState && saveSheetState.visible) {
        const previousSaveSheetState = saveSheetState;
        routeOverlayCommandActions.setSaveSheetState((prev) => ({
          ...prev,
          visible: false,
        }));
        return previousSaveSheetState;
      }
      return null;
    },
    [
      dismissSearchInteractionUi,
      ensureInitialCameraReady,
      routeOverlayCommandActions,
      routeOverlayCommandAuthority,
      routeSearchCommandActions,
    ]
  );

  return React.useMemo<ProfileAppForegroundExecutionRuntime>(
    () => ({
      prepareForegroundUiForProfileOpen,
    }),
    [prepareForegroundUiForProfileOpen]
  );
};
