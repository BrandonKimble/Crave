import type { RouteScenePolicyAuthority } from './route-scene-policy-authority-contract';
import { createRouteScenePolicyController } from './route-scene-policy-controller';

export const createRouteScenePolicyAuthority = ({
  scenePolicyController,
}: {
  scenePolicyController: ReturnType<typeof createRouteScenePolicyController>;
}): RouteScenePolicyAuthority => ({
  subscribe: scenePolicyController.outputAuthority.subscribe,
  getSnapshot: scenePolicyController.outputAuthority.getSnapshot,
});
