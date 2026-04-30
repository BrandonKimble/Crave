import type { AppRouteSceneTransitionSnapshot } from './app-route-scene-switch-authority';

export type RouteSceneTransitionSnapshot = AppRouteSceneTransitionSnapshot;

export const EMPTY_ROUTE_SCENE_TRANSITION_SNAPSHOT: RouteSceneTransitionSnapshot = {
  activeSceneKey: null,
  interactiveSceneKey: null,
  handoffSceneKey: null,
  pendingSceneKey: null,
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
