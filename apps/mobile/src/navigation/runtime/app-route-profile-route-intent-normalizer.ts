import type { OverlayRouteEntry } from './app-overlay-route-types';
import type {
  RouteSceneSwitchCameraIntent,
  RouteSceneSwitchRequestInput,
  RouteSceneSwitchRouteAction,
} from './app-overlay-route-transition-contract';
import type { RouteSceneSwitchRouteStateSnapshot } from './app-route-scene-switch-controller';
import type {
  PreparedProfilePresentationCompletionEvent,
  PreparedProfileRouteIntent,
  ProfilePresentationCommandExecutionContext,
} from './app-route-profile-prepared-presentation-transaction-contract';
import type { CameraSnapshot } from './app-route-profile-transition-state-contract';

type ProfileCameraIntentOptions = {
  animationMode?: 'none' | 'easeTo';
  animationDurationMs?: number;
};

export type PreparedProfileRouteIntentAction =
  | {
      type: 'update_active_search_restaurant_route';
      restaurantId: string | null;
      completionEvent: PreparedProfilePresentationCompletionEvent;
    }
  | {
      type: 'request_overlay_switch';
      request: RouteSceneSwitchRequestInput;
      completionEvent: PreparedProfilePresentationCompletionEvent;
    }
  | {
      type: 'complete_overlay_dismissed';
      completionEvent: PreparedProfilePresentationCompletionEvent;
    };

export const isSearchRestaurantRouteEntry = (
  route: OverlayRouteEntry
): route is OverlayRouteEntry<'restaurant'> =>
  route.key === 'restaurant' &&
  route.params != null &&
  'source' in route.params &&
  route.params.source === 'search';

export const resolveProfileCloseRouteAction = ({
  activeOverlayRoute,
  overlayRouteStackLength,
}: RouteSceneSwitchRouteStateSnapshot): Extract<
  RouteSceneSwitchRouteAction,
  'closeActive' | 'setRoot'
> =>
  activeOverlayRoute.key === 'restaurant' && overlayRouteStackLength > 1
    ? 'closeActive'
    : 'setRoot';

export const resolveProfileCameraIntent = (
  targetCamera: CameraSnapshot | null | undefined,
  options: ProfileCameraIntentOptions = {}
): RouteSceneSwitchCameraIntent | undefined =>
  targetCamera == null
    ? undefined
    : {
        kind: 'focus',
        center: targetCamera.center,
        zoom: targetCamera.zoom,
        animationMode: options.animationMode,
        animationDurationMs: options.animationDurationMs,
      };

export const resolvePreparedProfileRouteIntentAction = ({
  routeIntent,
  executionContext,
  routeState,
  cameraIntentOptions,
}: {
  routeIntent: PreparedProfileRouteIntent;
  executionContext: ProfilePresentationCommandExecutionContext;
  routeState: RouteSceneSwitchRouteStateSnapshot;
  cameraIntentOptions?: ProfileCameraIntentOptions;
}): PreparedProfileRouteIntentAction => {
  const isSearchRestaurantRouteActive = isSearchRestaurantRouteEntry(routeState.activeOverlayRoute);

  if (routeIntent.type === 'open_profile_restaurant_route') {
    const completionEvent: PreparedProfilePresentationCompletionEvent = {
      type: 'sheet_settled',
      snap: routeIntent.targetSheetSnap,
      requestToken: executionContext.requestToken,
    };

    if (isSearchRestaurantRouteActive && routeIntent.targetCamera == null) {
      return {
        type: 'update_active_search_restaurant_route',
        restaurantId: routeIntent.restaurantId,
        completionEvent,
      };
    }

    return {
      type: 'request_overlay_switch',
      request: {
        targetSceneKey: 'restaurant',
        routeAction: 'push',
        routeParams: {
          restaurantId: routeIntent.restaurantId,
          source: 'search',
        },
        settleToken: executionContext.requestToken,
        cameraIntent: resolveProfileCameraIntent(routeIntent.targetCamera, cameraIntentOptions),
        sheetIntent: {
          sceneKey: 'restaurant',
          snapTarget: routeIntent.targetSheetSnap,
          role: 'incoming',
        },
      },
      completionEvent,
    };
  }

  const completionEvent: PreparedProfilePresentationCompletionEvent = {
    type: 'overlay_dismissed',
    requestToken: executionContext.requestToken,
  };

  if (!isSearchRestaurantRouteActive) {
    return {
      type: 'complete_overlay_dismissed',
      completionEvent,
    };
  }

  return {
    type: 'request_overlay_switch',
    request: {
      targetSceneKey: routeState.previousOverlayRoute?.key ?? 'search',
      routeAction: resolveProfileCloseRouteAction(routeState),
      settleToken: executionContext.requestToken,
      cameraIntent: resolveProfileCameraIntent(routeIntent.restoreCamera, cameraIntentOptions),
      sheetIntent: {
        sceneKey: 'restaurant',
        snapTarget: 'hidden',
        role: 'outgoing',
      },
    },
    completionEvent,
  };
};
