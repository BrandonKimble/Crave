import React from 'react';

import type { OverlayKey, OverlayRouteEntry } from './app-overlay-route-types';
import { areOverlayRoutesEqual } from './app-overlay-route-stack-algebra';
import { useAppRouteSceneRuntime } from './AppRouteSceneRuntimeProvider';
import type { RouteOverlayNavigationSnapshot } from './route-overlay-navigation-snapshot-contract';
import { useRouteAuthoritySelector } from './use-route-authority-selector';

/**
 * The entry a scene's LEG renders (S-B slices 3b/4): with same-key nesting legal, a leg is a
 * rendering cache keyed by scene key — its content derives from the TOP-MOST stack entry of
 * its key (never `activeOverlayRoute`, which is whatever scene is on top of the whole stack).
 * `userProfile(A) → followList → userProfile(B)`: the userProfile leg shows B; pop back past
 * followList and it re-seeds to A — the entry VALUES are the truth, the leg just paints the
 * newest one of its kind.
 */
export const useTopMostRouteEntryForScene = <K extends OverlayKey>(
  sceneKey: K
): OverlayRouteEntry<K> | null => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const selector = React.useCallback(
    (snapshot: RouteOverlayNavigationSnapshot): OverlayRouteEntry<K> | null => {
      for (let index = snapshot.overlayRouteStack.length - 1; index >= 0; index -= 1) {
        const entry = snapshot.overlayRouteStack[index];
        if (entry?.key === sceneKey) {
          return entry as OverlayRouteEntry<K>;
        }
      }
      return null;
    },
    [sceneKey]
  );
  return useRouteAuthoritySelector({
    subscribe: (listener, attributionLabel) =>
      routeSceneRuntime.routeOverlayNavigationAuthority.registerTarget({
        selector,
        syncNavigationSnapshot: () => listener(),
        isEqual: (left, right) => areOverlayRoutesEqual(left, right),
        attributionLabel: attributionLabel ?? `topMostEntry:${sceneKey}`,
      }),
    getSnapshot: () => routeSceneRuntime.routeOverlayNavigationAuthority.getSnapshot(),
    selector,
    isEqual: (left, right) => areOverlayRoutesEqual(left, right),
    attributionOwner: 'useTopMostRouteEntryForScene',
    attributionOperation: sceneKey,
  });
};
