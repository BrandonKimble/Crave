import { makeMutable, type SharedValue } from 'react-native-reanimated';

import type { RouteOverlayDisplaySnapshot } from './route-overlay-display-snapshot-contract';
import {
  resolveRouteOverlayBottomNavIndex,
  syncRouteOverlayDisplaySharedValues,
  type RouteOverlayDisplaySharedValueTargets,
} from './route-overlay-display-shared-values';

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
    const initialSnapshot = routeOverlayDisplayAuthority.getSnapshot();
    this.activeTabIndexValue = makeMutable(
      resolveRouteOverlayBottomNavIndex(initialSnapshot.displayedRootOverlayKey)
    );
    const sharedValueTargets: RouteOverlayDisplaySharedValueTargets = {
      activeTabIndexValue: this.activeTabIndexValue,
    };
    this.unsubscribeDisplayTargets =
      routeOverlayDisplayAuthority.registerSharedValues(sharedValueTargets);
    syncRouteOverlayDisplaySharedValues(sharedValueTargets, initialSnapshot);
  }

  public dispose(): void {
    this.unsubscribeDisplayTargets();
  }
}

export const createAppRouteSceneDisplayTargetRegistry = (
  routeOverlayDisplayAuthority: RouteOverlayDisplayAuthority
): AppRouteSceneDisplayTargetRegistry =>
  new AppRouteSceneDisplayTargetRegistryController(routeOverlayDisplayAuthority);
