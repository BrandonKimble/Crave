import React from 'react';

import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import type { RouteSceneSwitchTransitionContract } from '../navigation/runtime/app-overlay-route-transition-contract';
import type { OverlayRouteParamsMap } from '../navigation/runtime/app-overlay-route-types';
import type { RestaurantRouteHostSnapController } from './restaurantRouteHostContract';

type RestaurantRouteSource = NonNullable<
  OverlayRouteParamsMap['restaurant']
>['source'];

type UseRestaurantRouteSheetMotionTargetRegistrationArgs = {
  enabled: boolean;
  source: Exclude<RestaurantRouteSource, undefined>;
  snapController: RestaurantRouteHostSnapController | null;
};

const getRestaurantRouteSource = (
  transitionContract: RouteSceneSwitchTransitionContract
): RestaurantRouteSource => {
  const params =
    transitionContract.committedRouteParams as
      | OverlayRouteParamsMap['restaurant']
      | undefined;
  return params?.source ?? 'search';
};

export const useRestaurantRouteSheetMotionTargetRegistration = ({
  enabled,
  source,
  snapController,
}: UseRestaurantRouteSheetMotionTargetRegistrationArgs): void => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const routeSceneMotionRuntime = routeSceneRuntime.routeSceneMotionRuntime;
  const matchesTransitionContract = React.useCallback(
    (transitionContract: RouteSceneSwitchTransitionContract) => {
      if (transitionContract.targetSceneKey !== 'restaurant') {
        return true;
      }
      return getRestaurantRouteSource(transitionContract) === source;
    },
    [source]
  );

  React.useEffect(() => {
    if (!enabled || snapController == null) {
      return undefined;
    }

    return routeSceneMotionRuntime.registerSheetMotionTarget({
      sceneKey: 'restaurant',
      localMotionKey: source,
      motionCommandValue: snapController.motionCommand,
      resolveCurrentSnapTarget: () => 'middle',
      matchesTransitionContract,
    });
  }, [
    enabled,
    matchesTransitionContract,
    routeSceneMotionRuntime,
    snapController,
    source,
  ]);
};
