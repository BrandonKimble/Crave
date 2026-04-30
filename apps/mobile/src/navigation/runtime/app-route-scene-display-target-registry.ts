import { makeMutable, type SharedValue } from 'react-native-reanimated';

import type { OverlayKey } from '../../overlays/types';
import type { RouteOverlayDisplaySnapshot } from './route-overlay-display-snapshot-contract';
import {
  resolveRouteOverlayBottomNavIndex,
  syncRouteOverlayDisplaySharedValues,
  type RouteOverlayDisplaySharedValueTargets,
} from './route-overlay-display-shared-values';

export type AppRouteSceneDisplayTargetRegistry = {
  activeTabIndexValue: SharedValue<number>;
  getSceneVisibilityValue: (sceneKey: OverlayKey) => SharedValue<number>;
  dispose: () => void;
};

type RouteOverlayDisplayAuthority = {
  getSnapshot: () => RouteOverlayDisplaySnapshot;
  registerSharedValues: (values: RouteOverlayDisplaySharedValueTargets) => () => void;
};

class AppRouteSceneDisplayTargetRegistryController implements AppRouteSceneDisplayTargetRegistry {
  public readonly activeTabIndexValue: SharedValue<number>;

  private readonly routeOverlayDisplayAuthority: RouteOverlayDisplayAuthority;

  private readonly sceneVisibilityValues = new Map<OverlayKey, SharedValue<number>>();

  private readonly unsubscribeDisplayTargets: () => void;

  constructor(routeOverlayDisplayAuthority: RouteOverlayDisplayAuthority) {
    this.routeOverlayDisplayAuthority = routeOverlayDisplayAuthority;
    const initialSnapshot = routeOverlayDisplayAuthority.getSnapshot();
    this.activeTabIndexValue = makeMutable(
      resolveRouteOverlayBottomNavIndex(initialSnapshot.displayedRootOverlayKey)
    );
    const sharedValueTargets: RouteOverlayDisplaySharedValueTargets = {
      activeTabIndexValue: this.activeTabIndexValue,
      getSceneVisibilityValue: (sceneKey) => this.sceneVisibilityValues.get(sceneKey),
    };
    this.unsubscribeDisplayTargets =
      routeOverlayDisplayAuthority.registerSharedValues(sharedValueTargets);
    this.syncDisplayTargets(initialSnapshot, sharedValueTargets);
  }

  public getSceneVisibilityValue(sceneKey: OverlayKey): SharedValue<number> {
    const existingValue = this.sceneVisibilityValues.get(sceneKey);
    if (existingValue != null) {
      return existingValue;
    }
    const value = makeMutable(
      this.resolveSceneVisibility(sceneKey, this.routeOverlayDisplayAuthority.getSnapshot())
    );
    this.sceneVisibilityValues.set(sceneKey, value);
    return value;
  }

  public dispose(): void {
    this.unsubscribeDisplayTargets();
    this.sceneVisibilityValues.clear();
  }

  private syncDisplayTargets(
    snapshot: RouteOverlayDisplaySnapshot,
    sharedValueTargets: RouteOverlayDisplaySharedValueTargets
  ): void {
    syncRouteOverlayDisplaySharedValues(sharedValueTargets, snapshot);
  }

  private resolveSceneVisibility(
    sceneKey: OverlayKey,
    snapshot: RouteOverlayDisplaySnapshot
  ): number {
    return snapshot.displayedSceneKey === sceneKey ? 1 : 0;
  }
}

export const createAppRouteSceneDisplayTargetRegistry = (
  routeOverlayDisplayAuthority: RouteOverlayDisplayAuthority
): AppRouteSceneDisplayTargetRegistry =>
  new AppRouteSceneDisplayTargetRegistryController(routeOverlayDisplayAuthority);
