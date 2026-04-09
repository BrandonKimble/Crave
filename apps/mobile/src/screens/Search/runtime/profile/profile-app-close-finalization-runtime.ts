import React from 'react';

import {
  type SearchRouteSaveSheetState as SaveSheetState,
  useSearchRouteOverlayCommandStore,
} from '../../../../overlays/searchRouteOverlayCommandStore';
import type { ProfileForegroundUiRestoreState } from './profile-transition-state-contract';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';

export type PreparedProfileCloseFinalization = {
  shouldClearSearch: boolean;
};

export type ProfileAppCloseFinalizationRuntime = {
  finalizePreparedProfileClose: (closeFinalization: PreparedProfileCloseFinalization) => void;
};

type UseProfileAppCloseFinalizationRuntimeArgs = {
  getPreviousForegroundUiRestoreState: ProfileRuntimeStateOwner['closeRuntimeState']['foregroundRuntimeState']['getPreviousForegroundUiRestoreState'];
  finalizePreparedProfileCloseState: ProfileRuntimeStateOwner['closeRuntimeState']['finalizationRuntimeState']['finalizePreparedProfileCloseState'];
  clearSearchAfterProfileDismiss: () => void;
};

export const useProfileAppCloseFinalizationRuntime = ({
  getPreviousForegroundUiRestoreState,
  finalizePreparedProfileCloseState,
  clearSearchAfterProfileDismiss,
}: UseProfileAppCloseFinalizationRuntimeArgs): ProfileAppCloseFinalizationRuntime => {
  const restoreForegroundUiAfterProfileClose = React.useCallback(
    (state: ProfileForegroundUiRestoreState | null) => {
      const restoreState = state as SaveSheetState | null;
      if (restoreState?.visible) {
        useSearchRouteOverlayCommandStore.getState().setSaveSheetState(restoreState);
      }
    },
    []
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
