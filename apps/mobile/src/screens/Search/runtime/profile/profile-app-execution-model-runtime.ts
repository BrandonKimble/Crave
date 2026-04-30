import React from 'react';

import type { AppRouteSceneRuntime } from '../../../../navigation/runtime/app-route-scene-runtime';
import { applySearchRestaurantRouteCommand } from '../../../../overlays/searchRestaurantRouteController';
import { useProfileAppCloseFinalizationRuntime } from './profile-app-close-finalization-runtime';
import { useProfileAppClosePreparationRuntime } from './profile-app-close-preparation-runtime';
import { useProfileAppForegroundExecutionRuntime } from './profile-app-foreground-runtime';
import type { ProfileAppExecutionArgs } from './profile-app-execution-runtime-contract';
import type { ProfileAppExecutionRuntime } from '../../../../navigation/runtime/app-route-profile-app-execution-runtime-contract';
import { useProfileAppRouteExecutionRuntime } from './profile-app-route-runtime';
import type { PreparedProfilePresentationCompletionEvent } from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transaction-contract';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';
import type { SearchRuntimeBus } from '../shared/search-runtime-bus';

type UseProfileAppExecutionModelRuntimeArgs = {
  routeSceneRuntime: AppRouteSceneRuntime;
  searchRuntimeBus: SearchRuntimeBus;
  appExecutionArgs: ProfileAppExecutionArgs;
  runtimeStateOwner: Pick<ProfileRuntimeStateOwner, 'closeRuntimeState'>;
  preparedProfileCompletionHandlerRef: React.MutableRefObject<
    ((event: PreparedProfilePresentationCompletionEvent) => void) | null
  >;
};

export const useProfileAppExecutionModelRuntime = ({
  routeSceneRuntime,
  searchRuntimeBus,
  appExecutionArgs,
  runtimeStateOwner,
  preparedProfileCompletionHandlerRef,
}: UseProfileAppExecutionModelRuntimeArgs): ProfileAppExecutionRuntime => {
  const profileAppForegroundExecutionRuntime = useProfileAppForegroundExecutionRuntime({
    routeOverlayCommandActions: routeSceneRuntime.routeOverlayCommandActions,
    routeOverlayCommandAuthority: routeSceneRuntime.routeOverlayCommandAuthority,
    routeSearchCommandActions: routeSceneRuntime.routeSearchCommandActions,
    foregroundExecutionArgs: appExecutionArgs.foregroundExecutionArgs,
  });
  const profileAppRouteExecutionRuntime = useProfileAppRouteExecutionRuntime({
    routeSceneRuntime,
    preparedProfileCompletionHandlerRef,
  });
  const { prepareForProfileClose } = useProfileAppClosePreparationRuntime({
    searchRuntimeBus,
    closeExecutionArgs: appExecutionArgs.closeExecutionArgs,
  });
  const { finalizePreparedProfileClose } = useProfileAppCloseFinalizationRuntime({
    routeOverlayCommandActions: routeSceneRuntime.routeOverlayCommandActions,
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
        routeSceneRuntime.routeSheetSnapSessionActions.setSharedSnap('middle');
      },
      clearMapHighlightedRestaurantId: () => {
        applySearchRestaurantRouteCommand(
          {
            type: 'update_search_restaurant_route',
            restaurantId: null,
          },
          routeSceneRuntime.routeOverlayRouteCommandRuntime
        );
      },
    }),
    [
      appExecutionArgs.resultsExecutionArgs.resultsSheetExecutionModel,
      routeSceneRuntime.routeOverlayRouteCommandRuntime,
      routeSceneRuntime.routeSheetSnapSessionActions,
    ]
  );

  return React.useMemo(
    () => ({
      shellExecutionModel: profileAppShellExecutionRuntime,
      commandExecutionModel: profileAppCommandExecutionRuntime,
    }),
    [profileAppCommandExecutionRuntime, profileAppShellExecutionRuntime]
  );
};
