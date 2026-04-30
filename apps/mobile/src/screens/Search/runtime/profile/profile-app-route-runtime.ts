import React from 'react';

import { applySearchRestaurantRouteCommand } from '../../../../overlays/searchRestaurantRouteController';
import type { AppRouteSceneRuntime } from '../../../../navigation/runtime/app-route-scene-runtime';
import {
  PROFILE_CAMERA_ANIMATION_MODE,
  PROFILE_CAMERA_ANIMATION_MS,
} from './profile-camera-motion-constants';
import { resolvePreparedProfileRouteIntentAction } from '../../../../navigation/runtime/app-route-profile-route-intent-normalizer';
import type { ProfileAppRouteExecutionRuntime } from '../../../../navigation/runtime/app-route-profile-app-execution-runtime-contract';
import type {
  PreparedProfilePresentationCompletionEvent,
  PreparedProfileRouteIntent,
  ProfilePresentationCommandExecutionContext,
} from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transaction-contract';

type PreparedProfileCompletionHandlerRef = React.MutableRefObject<
  ((event: PreparedProfilePresentationCompletionEvent) => void) | null
>;

type UseProfileAppRouteExecutionRuntimeArgs = {
  routeSceneRuntime: AppRouteSceneRuntime;
  preparedProfileCompletionHandlerRef: PreparedProfileCompletionHandlerRef;
};

export const useProfileAppRouteExecutionRuntime = ({
  routeSceneRuntime,
  preparedProfileCompletionHandlerRef,
}: UseProfileAppRouteExecutionRuntimeArgs): ProfileAppRouteExecutionRuntime => {
  const routeSceneSwitchActions = routeSceneRuntime.routeOverlayTransitionActions;
  const routeSceneSwitchRuntime = routeSceneRuntime.routeSceneSwitchRuntime;
  const routeOverlayRouteCommandRuntime = routeSceneRuntime.routeOverlayRouteCommandRuntime;

  const emitProfileRouteCompletionEvent = React.useCallback(
    (event: PreparedProfilePresentationCompletionEvent) => {
      preparedProfileCompletionHandlerRef.current?.(event);
    },
    [preparedProfileCompletionHandlerRef]
  );

  const applyProfileRouteIntent = React.useCallback(
    (
      routeIntent: PreparedProfileRouteIntent,
      executionContext: ProfilePresentationCommandExecutionContext
    ) => {
      const routeState = routeSceneSwitchRuntime.getRouteState();
      const routeIntentAction = resolvePreparedProfileRouteIntentAction({
        routeIntent,
        executionContext,
        routeState,
        cameraIntentOptions: {
          animationMode: PROFILE_CAMERA_ANIMATION_MODE,
          animationDurationMs: PROFILE_CAMERA_ANIMATION_MS,
        },
      });

      if (routeIntentAction.type === 'update_active_search_restaurant_route') {
        applySearchRestaurantRouteCommand(
          {
            type: 'update_search_restaurant_route',
            restaurantId: routeIntentAction.restaurantId,
          },
          routeOverlayRouteCommandRuntime
        );
        emitProfileRouteCompletionEvent(routeIntentAction.completionEvent);
        return;
      }

      if (routeIntentAction.type === 'request_overlay_switch') {
        routeSceneSwitchActions.requestOverlaySwitchWithSettleCallback(
          routeIntentAction.request,
          () => {
            emitProfileRouteCompletionEvent(routeIntentAction.completionEvent);
          }
        );
        return;
      }

      emitProfileRouteCompletionEvent(routeIntentAction.completionEvent);
    },
    [
      emitProfileRouteCompletionEvent,
      routeOverlayRouteCommandRuntime,
      routeSceneSwitchActions,
      routeSceneSwitchRuntime,
    ]
  );

  return React.useMemo<ProfileAppRouteExecutionRuntime>(
    () => ({
      applyProfileRouteIntent,
    }),
    [applyProfileRouteIntent]
  );
};
