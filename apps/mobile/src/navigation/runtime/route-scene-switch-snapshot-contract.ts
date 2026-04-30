import type { AppRouteSceneSwitchSnapshot } from './app-route-scene-switch-authority';

export type RouteSceneSwitchSnapshot = AppRouteSceneSwitchSnapshot;

export type RouteSceneSwitchAuthority = {
  subscribe: (listener: () => void, attributionLabel?: string) => () => void;
  getSnapshot: () => RouteSceneSwitchSnapshot;
};

export const EMPTY_ROUTE_SCENE_SWITCH_SNAPSHOT: RouteSceneSwitchSnapshot = {
  routeActiveSceneKey: null,
  interactiveSceneKey: null,
  pendingSceneKey: null,
  handoffSceneKey: null,
  transitionPhase: 'idle',
  transitionToken: 0,
  transitionContract: null,
  activePollsParams: null,
  activeDockedPollsRestoreIntent: null,
  isInteractive: true,
  routeState: {
    activeOverlayRoute: {
      key: 'search',
      params: undefined,
    },
    previousOverlayRoute: null,
    overlayRouteStack: [
      {
        key: 'search',
        params: undefined,
      },
    ],
    rootOverlayKey: 'search',
    overlayRouteStackLength: 1,
  },
};
