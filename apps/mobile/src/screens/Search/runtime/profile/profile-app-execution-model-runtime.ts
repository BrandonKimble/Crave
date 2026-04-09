import React from 'react';

import { applySearchRestaurantRouteCommand } from '../../../../overlays/searchRestaurantRouteController';
import { setSharedOverlaySnap } from '../../../../overlays/useOverlaySheetPositionStore';
import { useProfileAppCloseFinalizationRuntime } from './profile-app-close-finalization-runtime';
import { useProfileAppClosePreparationRuntime } from './profile-app-close-preparation-runtime';
import { useProfileAppForegroundExecutionRuntime } from './profile-app-foreground-runtime';
import type {
  ProfileAppExecutionArgs,
  ProfileAppExecutionRuntime,
} from './profile-app-execution-runtime-contract';
import { useProfileAppRouteExecutionRuntime } from './profile-app-route-runtime';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';
import type { SearchRuntimeBus } from '../shared/search-runtime-bus';

type UseProfileAppExecutionModelRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  appExecutionArgs: ProfileAppExecutionArgs;
  runtimeStateOwner: Pick<ProfileRuntimeStateOwner, 'closeRuntimeState'>;
};

export const useProfileAppExecutionModelRuntime = ({
  searchRuntimeBus,
  appExecutionArgs,
  runtimeStateOwner,
}: UseProfileAppExecutionModelRuntimeArgs): ProfileAppExecutionRuntime => {
  const profileAppForegroundExecutionRuntime = useProfileAppForegroundExecutionRuntime({
    foregroundExecutionArgs: appExecutionArgs.foregroundExecutionArgs,
  });
  const profileAppRouteExecutionRuntime = useProfileAppRouteExecutionRuntime();
  const { prepareForProfileClose } = useProfileAppClosePreparationRuntime({
    searchRuntimeBus,
    closeExecutionArgs: appExecutionArgs.closeExecutionArgs,
  });
  const { finalizePreparedProfileClose } = useProfileAppCloseFinalizationRuntime({
    getPreviousForegroundUiRestoreState:
      runtimeStateOwner.closeRuntimeState.foregroundRuntimeState
        .getPreviousForegroundUiRestoreState,
    finalizePreparedProfileCloseState:
      runtimeStateOwner.closeRuntimeState.finalizationRuntimeState
        .finalizePreparedProfileCloseState,
    clearSearchAfterProfileDismiss:
      appExecutionArgs.closeExecutionArgs.clearSearchAfterProfileDismiss,
  });

  const profileAppCloseExecutionRuntime = React.useMemo(
    () => ({
      prepareForProfileClose,
      finalizePreparedProfileClose,
    }),
    [finalizePreparedProfileClose, prepareForProfileClose]
  );
  const profileAppShellExecutionRuntime = React.useMemo(
    () => ({
      foregroundExecutionModel: profileAppForegroundExecutionRuntime,
      routeExecutionModel: profileAppRouteExecutionRuntime,
      closeExecutionModel: profileAppCloseExecutionRuntime,
    }),
    [
      profileAppCloseExecutionRuntime,
      profileAppForegroundExecutionRuntime,
      profileAppRouteExecutionRuntime,
    ]
  );
  const profileAppCommandExecutionRuntime = React.useMemo(
    () => ({
      requestResultsSheetSnap:
        appExecutionArgs.resultsExecutionArgs.resultsSheetExecutionModel.requestResultsSheetSnap,
      hideResultsSheet:
        appExecutionArgs.resultsExecutionArgs.resultsSheetExecutionModel.hideResultsSheet,
      forceSharedMiddleSnap: () => {
        setSharedOverlaySnap('middle');
      },
      clearMapHighlightedRestaurantId: () => {
        applySearchRestaurantRouteCommand({
          type: 'update_search_restaurant_route',
          restaurantId: null,
        });
      },
    }),
    [appExecutionArgs.resultsExecutionArgs.resultsSheetExecutionModel]
  );

  return React.useMemo(
    () => ({
      shellExecutionModel: profileAppShellExecutionRuntime,
      commandExecutionModel: profileAppCommandExecutionRuntime,
    }),
    [profileAppCommandExecutionRuntime, profileAppShellExecutionRuntime]
  );
};
