import type { AppRouteSceneSwitchSnapshot } from './app-route-scene-switch-authority';
import { ROOT_SEARCH_ROUTE_ENTRY } from './app-overlay-route-stack-algebra';

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
    activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
    previousOverlayRoute: null,
    overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
    rootOverlayKey: 'search',
    overlayRouteStackLength: 1,
  },
};
