import {
  createPollCreationChildRouteParams,
  createPollDetailChildRouteParams,
  isAppOverlayRouteSceneSwitchKey,
  type OverlayKey,
  type OverlayRouteParamsMap,
} from './app-overlay-route-types';
import type {
  RouteSceneSwitchRequestInput,
  RouteSceneSwitchRouteParams,
} from './app-overlay-route-transition-contract';
import type { OverlaySheetSnap } from '../../overlays/types';
import type {
  AppRouteSceneSwitchRuntime,
  RouteSceneSwitchRouteStateSnapshot,
  RouteSceneSwitchSettleCallback,
} from './app-route-scene-switch-controller';

const shouldRouteThroughSceneSwitch = <K extends OverlayKey>(
  overlay: K,
  params?: OverlayRouteParamsMap[K]
): boolean =>
  isAppOverlayRouteSceneSwitchKey(overlay) &&
  (params == null || overlay === 'polls' || overlay === 'restaurant');

const resolveRouteSwitchPollsParams = <K extends OverlayKey>(
  overlay: K,
  params?: OverlayRouteParamsMap[K]
): OverlayRouteParamsMap['polls'] | null =>
  overlay === 'polls' ? ((params as OverlayRouteParamsMap['polls']) ?? null) : null;

export type AppOverlayRouteCommandRuntime = {
  getRouteState: () => RouteSceneSwitchRouteStateSnapshot;
  setRootRoute: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  updateRoute: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  pushRoute: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  restoreDockedPolls: (args?: { snap?: Exclude<OverlaySheetSnap, 'hidden'> }) => void;
  collapseActiveSheet: (args?: { snap?: Exclude<OverlaySheetSnap, 'hidden'> }) => void;
  closeActiveRoute: () => void;
  closeActiveRouteAfterSettle: (onSettle: RouteSceneSwitchSettleCallback) => void;
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
      ? routeSceneSwitchRuntime.requestOverlaySwitchWithSettleCallback(input, onSettle)
      : routeSceneSwitchRuntime.requestOverlaySwitch(input);

  const closeActiveRoute = (onSettle?: RouteSceneSwitchSettleCallback): void => {
    const routeState = routeSceneSwitchRuntime.getRouteState();
    const { activeOverlayRoute } = routeState;
    const previousOverlayRouteKey = routeSceneSwitchRuntime.getPreviousRouteKey();
    if (
      previousOverlayRouteKey != null &&
      isAppOverlayRouteSceneSwitchKey(activeOverlayRoute.key)
    ) {
      requestRouteSceneSwitch(
        {
          targetSceneKey: previousOverlayRouteKey,
          routeAction: 'closeActive',
          sheetTransitionKind: 'closeChild',
          sheetOpenerSource: 'routeCommand',
          sheetMotion: { kind: 'preserveLiveY' },
        },
        onSettle
      );
      return;
    }
    if (activeOverlayRoute.key === 'restaurant') {
      requestRouteSceneSwitch(
        {
          targetSceneKey: 'polls',
          routeAction: 'setRoot',
          sheetTransitionKind: 'terminalDismiss',
          sheetOpenerSource: 'systemDismiss',
          sheetMotion: { kind: 'snapTo', snap: 'collapsed' },
          contentHandoff: 'preserveOutgoingUntilSettle',
          dockedPollsRestoreSnap: 'collapsed',
        },
        onSettle
      );
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
          sheetTransitionKind: 'topLevelSwitch',
          sheetOpenerSource: 'navTab',
        });
        return;
      }
      routeSceneSwitchRuntime.setRootRouteState(overlay, params);
    },
    updateRoute: (overlay, params) => {
      routeSceneSwitchRuntime.updateRouteState(overlay, params);
    },
    restoreDockedPolls: ({ snap = 'collapsed' } = {}) => {
      requestRouteSceneSwitch({
        targetSceneKey: 'search',
        routeAction: 'setRoot',
        sheetTransitionKind: 'topLevelSwitch',
        sheetOpenerSource: 'routeCommand',
        sheetMotion: { kind: 'snapTo', snap },
        dockedPollsRestoreSnap: snap,
      });
    },
    collapseActiveSheet: ({ snap = 'collapsed' } = {}) => {
      const { activeOverlayRoute } = routeSceneSwitchRuntime.getRouteState();
      if (!isAppOverlayRouteSceneSwitchKey(activeOverlayRoute.key)) {
        return;
      }
      requestRouteSceneSwitch({
        targetSceneKey: activeOverlayRoute.key,
        routeAction: 'updateActive',
        routeParams: activeOverlayRoute.params as RouteSceneSwitchRouteParams,
        sheetTransitionKind: 'gesture',
        sheetOpenerSource: 'routeCommand',
        sheetMotion: { kind: 'snapTo', snap },
        snapPersistence: 'sharedOnly',
      });
    },
    pushRoute: (overlay, params) => {
      if (overlay === 'pollCreation') {
        requestRouteSceneSwitch({
          targetSceneKey: overlay,
          routeAction: 'push',
          routeParams: createPollCreationChildRouteParams(
            params as OverlayRouteParamsMap['pollCreation']
          ),
          sheetTransitionKind: 'openChild',
          sheetOpenerSource: 'pollAction',
          sheetMotion: { kind: 'snapTo', snap: 'expanded' },
        });
        return;
      }
      if (overlay === 'pollDetail') {
        requestRouteSceneSwitch({
          targetSceneKey: overlay,
          routeAction: 'push',
          routeParams: createPollDetailChildRouteParams(
            params as OverlayRouteParamsMap['pollDetail']
          ),
          sheetTransitionKind: 'openChild',
          sheetOpenerSource: 'pollAction',
          sheetMotion: { kind: 'snapTo', snap: 'expanded' },
        });
        return;
      }
      if (overlay === 'favoriteListDetail' || overlay === 'saveList' || overlay === 'restaurant') {
        requestRouteSceneSwitch({
          targetSceneKey: overlay,
          routeAction: 'push',
          routeParams: params,
          sheetTransitionKind: 'openChild',
          sheetOpenerSource: 'routeCommand',
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
      if (rootOverlayRouteKey != null && isAppOverlayRouteSceneSwitchKey(activeOverlayRoute.key)) {
        requestRouteSceneSwitch({
          targetSceneKey: rootOverlayRouteKey,
          routeAction: 'popToRoot',
          sheetTransitionKind: 'closeChild',
          sheetOpenerSource: 'routeCommand',
          sheetMotion: { kind: 'preserveLiveY' },
        });
        return;
      }
      routeSceneSwitchRuntime.popToRootRouteState();
    },
  };
};
