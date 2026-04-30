import type { RouteScenePolicySnapshot } from './app-route-scene-policy-contract';

export const ROUTE_SCENE_POLICY_KEYS = ['search'] as const;

export type RouteScenePolicyKey = (typeof ROUTE_SCENE_POLICY_KEYS)[number];

export type RouteScenePolicyAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => RouteScenePolicySnapshot;
};

export type RouteScenePolicyAuthorityMap = Record<
  RouteScenePolicyKey,
  RouteScenePolicyAuthority
>;
