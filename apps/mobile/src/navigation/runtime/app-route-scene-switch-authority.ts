import type { OverlayKey } from '../../overlays/types';
import type {
  RouteSceneSwitchDockedPollsRestoreIntent,
  RouteSceneSwitchPollsParams,
  RouteSceneSwitchTransitionContract,
  RouteSceneSwitchTransitionPhase,
} from './app-overlay-route-transition-contract';
import type { RouteSceneSwitchRouteStateSnapshot } from './app-route-scene-switch-controller';

export type AppRouteSceneSwitchSnapshot = {
  routeActiveSceneKey: OverlayKey | null;
  interactiveSceneKey: OverlayKey | null;
  pendingSceneKey: OverlayKey | null;
  handoffSceneKey: OverlayKey | null;
  transitionPhase: RouteSceneSwitchTransitionPhase;
  transitionToken: number;
  transitionContract: RouteSceneSwitchTransitionContract | null;
  activePollsParams: RouteSceneSwitchPollsParams | null;
  activeDockedPollsRestoreIntent: RouteSceneSwitchDockedPollsRestoreIntent | null;
  isInteractive: boolean;
  routeState: RouteSceneSwitchRouteStateSnapshot;
};

export type AppRouteSceneTransitionSnapshot = {
  activeSceneKey: OverlayKey | null;
  interactiveSceneKey: OverlayKey | null;
  pendingSceneKey: OverlayKey | null;
  handoffSceneKey: OverlayKey | null;
  transitionPhase: RouteSceneSwitchTransitionPhase;
  transitionToken: number;
  transitionContract: RouteSceneSwitchTransitionContract | null;
  activePollsParams: RouteSceneSwitchPollsParams | null;
  activeDockedPollsRestoreIntent: RouteSceneSwitchDockedPollsRestoreIntent | null;
  isInteractive: boolean;
  routeState: RouteSceneSwitchRouteStateSnapshot;
};

export type AppRouteSceneActivitySnapshot = {
  routeActiveSceneKey: OverlayKey | null;
  activeSceneKey: OverlayKey | null;
  interactiveSceneKey: OverlayKey | null;
  pendingSceneKey: OverlayKey | null;
  handoffSceneKey: OverlayKey | null;
  transitionPhase: RouteSceneSwitchTransitionPhase;
  transitionToken: number;
  transitionContract: RouteSceneSwitchTransitionContract | null;
  isInteractive: boolean;
};

export type AppRouteScenePayloadSnapshot = {
  activePollsParams: RouteSceneSwitchPollsParams | null;
  activeDockedPollsRestoreIntent: RouteSceneSwitchDockedPollsRestoreIntent | null;
};

export type AppRouteSceneInteractivitySnapshot = {
  transitionPhase: RouteSceneSwitchTransitionPhase;
  isInteractive: boolean;
};

export type AppRouteSceneSwitchAuthority = {
  subscribe: (listener: () => void, attributionLabel?: string) => () => void;
  getSnapshot: () => AppRouteSceneSwitchSnapshot;
};

export type AppRouteSceneTransitionAuthority = {
  subscribe: (listener: () => void, attributionLabel?: string) => () => void;
  getSnapshot: () => AppRouteSceneTransitionSnapshot;
};

export type AppRouteSceneActivityAuthority = {
  subscribe: (listener: () => void, attributionLabel?: string) => () => void;
  getSnapshot: () => AppRouteSceneActivitySnapshot;
};

export type AppRouteScenePayloadAuthority = {
  subscribe: (listener: () => void, attributionLabel?: string) => () => void;
  getSnapshot: () => AppRouteScenePayloadSnapshot;
};

export type AppRouteSceneInteractivityAuthority = {
  subscribe: (listener: () => void, attributionLabel?: string) => () => void;
  getSnapshot: () => AppRouteSceneInteractivitySnapshot;
};

export type AppRouteSceneSwitchAuthorities = {
  sceneSwitchAuthority: AppRouteSceneSwitchAuthority;
  sceneTransitionAuthority: AppRouteSceneTransitionAuthority;
  sceneActivityAuthority: AppRouteSceneActivityAuthority;
  scenePayloadAuthority: AppRouteScenePayloadAuthority;
  sceneInteractivityAuthority: AppRouteSceneInteractivityAuthority;
};
