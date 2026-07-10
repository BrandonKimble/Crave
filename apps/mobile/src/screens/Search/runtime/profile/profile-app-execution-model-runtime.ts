import React from 'react';

import type { AppRouteSceneRuntime } from '../../../../navigation/runtime/app-route-scene-runtime';
import { applySearchRestaurantRouteCommand } from '../../../../overlays/searchRestaurantRouteController';
import { useProfileAppClosePreparationRuntime } from './profile-app-close-preparation-runtime';
import { useProfileAppForegroundExecutionRuntime } from './profile-app-foreground-runtime';
import type { ProfileAppExecutionArgs } from './profile-app-execution-runtime-contract';
import type { ProfileAppExecutionRuntime } from '../../../../navigation/runtime/app-route-profile-app-execution-runtime-contract';
import type { ResultsPresentationSurfaceAuthority } from '../shared/results-presentation-surface-authority';

type UseProfileAppExecutionModelRuntimeArgs = {
  routeSceneRuntime: AppRouteSceneRuntime;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  appExecutionArgs: ProfileAppExecutionArgs;
};

export const useProfileAppExecutionModelRuntime = ({
  routeSceneRuntime,
  resultsPresentationSurfaceAuthority,
  appExecutionArgs,
}: UseProfileAppExecutionModelRuntimeArgs): ProfileAppExecutionRuntime => {
  const profileAppForegroundExecutionRuntime = useProfileAppForegroundExecutionRuntime({
    routeOverlayCommandActions: routeSceneRuntime.routeOverlayCommandActions,
    routeOverlayCommandAuthority: routeSceneRuntime.routeOverlayCommandAuthority,
    foregroundExecutionArgs: appExecutionArgs.foregroundExecutionArgs,
  });
  const { prepareForProfileClose } = useProfileAppClosePreparationRuntime({
    resultsPresentationSurfaceAuthority,
    closeExecutionArgs: appExecutionArgs.closeExecutionArgs,
  });
  const clearMapHighlightedRestaurantId = React.useCallback(() => {
    applySearchRestaurantRouteCommand(
      {
        type: 'update_search_restaurant_route',
        restaurantId: null,
      },
      routeSceneRuntime.routeOverlayRouteCommandRuntime
    );
  }, [routeSceneRuntime.routeOverlayRouteCommandRuntime]);
  const profileAppCloseExecutionRuntime = React.useMemo(
    () => ({
      prepareForProfileClose,
    }),
    [prepareForProfileClose]
  );
  const profileAppShellExecutionRuntime = React.useMemo(
    () => ({
      foregroundExecutionModel: profileAppForegroundExecutionRuntime,
      closeExecutionModel: profileAppCloseExecutionRuntime,
    }),
    [profileAppCloseExecutionRuntime, profileAppForegroundExecutionRuntime]
  );
  const profileAppCommandExecutionRuntime = React.useMemo(
    () => ({
      clearMapHighlightedRestaurantId,
    }),
    [clearMapHighlightedRestaurantId]
  );

  return React.useMemo(
    () => ({
      shellExecutionModel: profileAppShellExecutionRuntime,
      commandExecutionModel: profileAppCommandExecutionRuntime,
    }),
    [profileAppCommandExecutionRuntime, profileAppShellExecutionRuntime]
  );
};
