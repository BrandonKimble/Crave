import type { AppRouteSceneSwitchSnapshot } from './app-route-scene-switch-authority';

export type RouteSceneSwitchSnapshot = AppRouteSceneSwitchSnapshot;

export type RouteSceneSwitchAuthority = {
  subscribe: (listener: () => void, attributionLabel?: string) => () => void;
  getSnapshot: () => RouteSceneSwitchSnapshot;
};
