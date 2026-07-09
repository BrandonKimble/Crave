import type { AppRouteSceneTransitionSnapshot } from './app-route-scene-switch-authority';
import { ROOT_SEARCH_ROUTE_ENTRY } from './app-overlay-route-stack-algebra';

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
    activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
    previousOverlayRoute: null,
    overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
    rootOverlayKey: 'search',
    overlayRouteStackLength: 1,
  },
};
