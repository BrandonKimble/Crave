import {
  createAppRouteSceneInputController,
  type AppRouteSceneInputAuthority,
  type AppRouteSceneInputController,
} from './app-route-scene-input-registry';
import {
  createRouteSceneInputLane,
  createRouteScenePolicyAuthority,
  type RouteShellSceneInputLane,
} from './route-scene-registry-authority-runtime';
import { createRouteScenePolicyController } from './route-scene-policy-controller';
import type { RouteScenePolicyAuthority } from './route-scene-policy-authority-contract';

export type RouteSceneRegistryControllerRuntime = {
  searchScenePolicyAuthority: RouteScenePolicyAuthority;
  sceneInputAuthority: AppRouteSceneInputAuthority;
  sceneInputLane: RouteShellSceneInputLane;
  dispose: () => void;
};

export const createRouteSceneRegistryControllerRuntime =
  (): RouteSceneRegistryControllerRuntime => {
    const routeSearchScenePolicyController = createRouteScenePolicyController();
    const routeSceneInputController: AppRouteSceneInputController =
      createAppRouteSceneInputController();

    return {
      searchScenePolicyAuthority: createRouteScenePolicyAuthority({
        scenePolicyController: routeSearchScenePolicyController,
      }),
      sceneInputAuthority: routeSceneInputController.authority,
      sceneInputLane: createRouteSceneInputLane({
        sceneInputActions: routeSceneInputController.actions,
        scenePolicyInputAuthority:
          routeSearchScenePolicyController.inputAuthority,
      }),
      dispose: () => {
        routeSceneInputController.dispose();
        routeSearchScenePolicyController.dispose();
      },
    };
  };
