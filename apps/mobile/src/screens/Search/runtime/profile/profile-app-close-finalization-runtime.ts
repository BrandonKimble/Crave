import React from 'react';

import type { AppRouteOverlayCommandActions } from '../../../../navigation/runtime/app-route-overlay-command-controller';
import { resolveProfileForegroundSaveSheetRestoreState } from '../../../../navigation/runtime/app-route-profile-app-execution-normalizer';
import type { PreparedProfileCloseFinalization } from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transaction-contract';
import type { ProfileForegroundUiRestoreState } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';

export type ProfileAppCloseFinalizationRuntime = {
  finalizePreparedProfileClose: (closeFinalization: PreparedProfileCloseFinalization) => void;
};

type UseProfileAppCloseFinalizationRuntimeArgs = {
  routeOverlayCommandActions: AppRouteOverlayCommandActions;
  getPreviousForegroundUiRestoreState: ProfileRuntimeStateOwner['closeRuntimeState']['foregroundRuntimeState']['getPreviousForegroundUiRestoreState'];
  finalizePreparedProfileCloseState: ProfileRuntimeStateOwner['closeRuntimeState']['finalizationRuntimeState']['finalizePreparedProfileCloseState'];
  clearSearchAfterProfileDismiss: () => void;
};

export const useProfileAppCloseFinalizationRuntime = ({
  routeOverlayCommandActions,
  getPreviousForegroundUiRestoreState,
  finalizePreparedProfileCloseState,
  clearSearchAfterProfileDismiss,
}: UseProfileAppCloseFinalizationRuntimeArgs): ProfileAppCloseFinalizationRuntime => {
  const restoreForegroundUiAfterProfileClose = React.useCallback(
    (state: ProfileForegroundUiRestoreState | null) => {
      const restoreState = resolveProfileForegroundSaveSheetRestoreState(state);
      if (restoreState) {
        routeOverlayCommandActions.setSaveSheetState(restoreState);
      }
    },
    [routeOverlayCommandActions]
  );

  const finalizePreparedProfileClose = React.useCallback(
    (closeFinalization: PreparedProfileCloseFinalization) => {
      restoreForegroundUiAfterProfileClose(getPreviousForegroundUiRestoreState());
      finalizePreparedProfileCloseState();
      if (closeFinalization.shouldClearSearch) {
        clearSearchAfterProfileDismiss();
      }
    },
    [
      clearSearchAfterProfileDismiss,
      finalizePreparedProfileCloseState,
      getPreviousForegroundUiRestoreState,
      restoreForegroundUiAfterProfileClose,
    ]
  );

  return React.useMemo<ProfileAppCloseFinalizationRuntime>(
    () => ({
      finalizePreparedProfileClose,
    }),
    [finalizePreparedProfileClose]
  );
};
