import type { OverlayKey, OverlayRouteParamsMap } from './app-overlay-route-types';
import type { RouteSceneSwitchRequestInput } from './app-overlay-route-transition-contract';
import type {
  AppRouteSceneSwitchRuntime,
  RouteSceneSwitchRouteStateSnapshot,
  RouteSceneSwitchSettleCallback,
} from './app-route-scene-switch-controller';

const APP_ROUTE_TRANSITION_SCENE_KEYS = new Set<OverlayKey>([
  'search',
  'polls',
  'bookmarks',
  'profile',
  'saveList',
  'pollCreation',
  'restaurant',
]);

const shouldRouteThroughSceneSwitch = <K extends OverlayKey>(
  overlay: K,
  params?: OverlayRouteParamsMap[K]
): boolean =>
  APP_ROUTE_TRANSITION_SCENE_KEYS.has(overlay) &&
  (params == null || overlay === 'polls' || overlay === 'restaurant');

const resolveRouteSwitchPollsParams = <K extends OverlayKey>(
  overlay: K,
  params?: OverlayRouteParamsMap[K]
): OverlayRouteParamsMap['polls'] | null =>
  overlay === 'polls' ? (params as OverlayRouteParamsMap['polls']) ?? null : null;

const isAppRouteTransitionSceneKey = (overlay: OverlayKey): boolean =>
  APP_ROUTE_TRANSITION_SCENE_KEYS.has(overlay);

export type AppOverlayRouteCommandRuntime = {
  getRouteState: () => RouteSceneSwitchRouteStateSnapshot;
  setRootRoute: <K extends OverlayKey>(
    overlay: K,
    params?: OverlayRouteParamsMap[K]
  ) => void;
  updateRoute: <K extends OverlayKey>(
    overlay: K,
    params?: OverlayRouteParamsMap[K]
  ) => void;
  pushRoute: <K extends OverlayKey>(
    overlay: K,
    params?: OverlayRouteParamsMap[K]
  ) => void;
  closeActiveRoute: () => void;
  closeActiveRouteAfterSettle: (
    onSettle: RouteSceneSwitchSettleCallback
  ) => void;
  popToRootRoute: () => void;
};

export const createAppOverlayRouteCommandRuntime = ({
  routeSceneSwitchRuntime,
}: {
  routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime;
}): AppOverlayRouteCommandRuntime => {
  const requestRouteSceneSwitch = (
    input: RouteSceneSwitchRequestInput,
    onSettle?: RouteSceneSwitchSettleCallback
  ): number =>
    onSettle
      ? routeSceneSwitchRuntime.requestOverlaySwitchWithSettleCallback(
          input,
          onSettle
        )
      : routeSceneSwitchRuntime.requestOverlaySwitch(input);

  const closeActiveRoute = (
    onSettle?: RouteSceneSwitchSettleCallback
  ): void => {
    const routeState = routeSceneSwitchRuntime.getRouteState();
    const { activeOverlayRoute } = routeState;
    const previousOverlayRouteKey = routeSceneSwitchRuntime.getPreviousRouteKey();
    if (
      previousOverlayRouteKey != null &&
      isAppRouteTransitionSceneKey(activeOverlayRoute.key)
    ) {
      requestRouteSceneSwitch({
        targetSceneKey: previousOverlayRouteKey,
        routeAction: 'closeActive',
      }, onSettle);
      return;
    }
    if (activeOverlayRoute.key === 'restaurant') {
      requestRouteSceneSwitch({
        targetSceneKey: 'search',
        routeAction: 'setRoot',
      }, onSettle);
      return;
    }
    routeSceneSwitchRuntime.closeActiveRouteState();
    onSettle?.();
  };

  return {
    getRouteState: () => routeSceneSwitchRuntime.getRouteState(),
    setRootRoute: (overlay, params) => {
      if (shouldRouteThroughSceneSwitch(overlay, params)) {
        requestRouteSceneSwitch({
          targetSceneKey: overlay,
          pollsParams: resolveRouteSwitchPollsParams(overlay, params),
          routeAction: 'setRoot',
          routeParams: params,
        });
        return;
      }
      routeSceneSwitchRuntime.setRootRouteState(overlay, params);
    },
    updateRoute: (overlay, params) => {
      routeSceneSwitchRuntime.updateRouteState(overlay, params);
    },
    pushRoute: (overlay, params) => {
      if (overlay === 'pollCreation' || overlay === 'restaurant') {
        requestRouteSceneSwitch({
          targetSceneKey: overlay,
          routeAction: 'push',
          routeParams: params,
        });
        return;
      }
      routeSceneSwitchRuntime.pushRouteState(overlay, params);
    },
    closeActiveRoute: () => {
      closeActiveRoute();
    },
    closeActiveRouteAfterSettle: (onSettle) => {
      closeActiveRoute(onSettle);
    },
    popToRootRoute: () => {
      const { activeOverlayRoute } = routeSceneSwitchRuntime.getRouteState();
      const rootOverlayRouteKey = routeSceneSwitchRuntime.getRootRouteKey();
      if (
        rootOverlayRouteKey != null &&
        isAppRouteTransitionSceneKey(activeOverlayRoute.key)
      ) {
        requestRouteSceneSwitch({
          targetSceneKey: rootOverlayRouteKey,
          routeAction: 'popToRoot',
        });
        return;
      }
      routeSceneSwitchRuntime.popToRootRouteState();
    },
  };
};
