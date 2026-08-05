import React from 'react';

import type {
  AppRouteOverlayCommandActions,
  AppRouteOverlayCommandAuthority,
} from '../../../../navigation/runtime/app-route-overlay-command-controller';
import { dismissTransientOverlays } from '../../../../overlays/overlayTransientDismissorRuntime';
import type { ProfileAppForegroundExecutionRuntime } from '../../../../navigation/runtime/app-route-profile-app-execution-runtime-contract';

export type ProfileAppForegroundExecutionArgs = {
  dismissSearchInteractionUi: () => void;
  ensureInitialCameraReady: () => void;
};

type UseProfileAppForegroundExecutionRuntimeArgs = {
  routeOverlayCommandActions: AppRouteOverlayCommandActions;
  routeOverlayCommandAuthority: AppRouteOverlayCommandAuthority;
  foregroundExecutionArgs: ProfileAppForegroundExecutionArgs;
};

export const useProfileAppForegroundExecutionRuntime = ({
  routeOverlayCommandActions,
  routeOverlayCommandAuthority,
  foregroundExecutionArgs,
}: UseProfileAppForegroundExecutionRuntimeArgs): ProfileAppForegroundExecutionRuntime => {
  const { dismissSearchInteractionUi, ensureInitialCameraReady } = foregroundExecutionArgs;

  const prepareForegroundUiForProfileOpen = React.useCallback(() => {
    // S-C.3-B step 3 (ledger item 10): the ensureAppSearchRouteSearchScene re-root is
    // DELETED — a restaurant profile opens as a push over whatever is on the stack; the
    // root persists (entries-as-values).
    dismissTransientOverlays();
    dismissSearchInteractionUi();
    ensureInitialCameraReady();
    // F1055 / D50 (2026-08-03): a profile open always dismisses the save sheet — it does
    // NOT come back on close (finish-or-cancel). The prior capture-and-maybe-restore
    // machinery had no reader on the restore side (verified repo-wide, zero call sites)
    // and is deleted; this hide is unconditional.
    const { saveSheetState } = routeOverlayCommandAuthority.getSnapshot();
    if (saveSheetState.visible) {
      routeOverlayCommandActions.setSaveSheetState((prev) => ({
        ...prev,
        visible: false,
      }));
    }
  }, [
    dismissSearchInteractionUi,
    ensureInitialCameraReady,
    routeOverlayCommandActions,
    routeOverlayCommandAuthority,
  ]);

  return React.useMemo<ProfileAppForegroundExecutionRuntime>(
    () => ({
      prepareForegroundUiForProfileOpen,
    }),
    [prepareForegroundUiForProfileOpen]
  );
};
