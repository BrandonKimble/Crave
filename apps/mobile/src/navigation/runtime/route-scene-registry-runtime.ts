import {
  type RouteShellSceneInputLane,
} from './route-scene-registry-authority-runtime';
import type { AppRouteSceneInputAuthority } from './app-route-scene-input-registry';
import { createRouteSceneRegistryControllerRuntime } from './route-scene-registry-controller-runtime';
import type { RouteScenePolicyAuthority } from './route-scene-policy-authority-contract';

export type RouteSceneRegistryRuntime = {
  searchScenePolicyAuthority: RouteScenePolicyAuthority;
  sceneInputAuthority: AppRouteSceneInputAuthority;
  sceneInputLane: RouteShellSceneInputLane;
  dispose: () => void;
};

export type { RouteShellSceneInputLane } from './route-scene-registry-authority-runtime';

export const createRouteSceneRegistryRuntime = (): RouteSceneRegistryRuntime =>
  createRouteSceneRegistryControllerRuntime();
