import type { RouteScenePolicySnapshot } from './app-route-scene-policy-contract';

export type RouteScenePolicyAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => RouteScenePolicySnapshot;
};
