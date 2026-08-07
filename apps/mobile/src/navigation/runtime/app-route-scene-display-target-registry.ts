import { makeMutable, type SharedValue } from 'react-native-reanimated';

import type { RouteOverlayDisplaySnapshot } from './route-overlay-display-snapshot-contract';
import { type RouteOverlayDisplaySharedValueTargets } from './route-overlay-display-shared-values';

export type AppRouteSceneDisplayTargetRegistry = {
  activeTabIndexValue: SharedValue<number>;
  dispose: () => void;
};

type RouteOverlayDisplayAuthority = {
  getSnapshot: () => RouteOverlayDisplaySnapshot;
  registerSharedValues: (values: RouteOverlayDisplaySharedValueTargets) => () => void;
};

class AppRouteSceneDisplayTargetRegistryController implements AppRouteSceneDisplayTargetRegistry {
  public readonly activeTabIndexValue: SharedValue<number>;

  private readonly unsubscribeDisplayTargets: () => void;

  constructor(routeOverlayDisplayAuthority: RouteOverlayDisplayAuthority) {
    // F5400: the seed is the authority's published index — this site used to re-derive it
    // from `displayedRootOverlayKey` (the second of three copies of one formula) and then
    // write the SAME value a third time, with an explicit sync call after
    // `registerSharedValues` had already synced it.
    this.activeTabIndexValue = makeMutable(
      routeOverlayDisplayAuthority.getSnapshot().activeTabIndex
    );
    this.unsubscribeDisplayTargets = routeOverlayDisplayAuthority.registerSharedValues({
      activeTabIndexValue: this.activeTabIndexValue,
    });
  }

  public dispose(): void {
    this.unsubscribeDisplayTargets();
  }
}

export const createAppRouteSceneDisplayTargetRegistry = (
  routeOverlayDisplayAuthority: RouteOverlayDisplayAuthority
): AppRouteSceneDisplayTargetRegistry =>
  new AppRouteSceneDisplayTargetRegistryController(routeOverlayDisplayAuthority);
