import React from 'react';

import type { OverlayKey, OverlayRouteEntry } from './app-overlay-route-types';
import { areOverlayRoutesEqual } from './app-overlay-route-stack-algebra';
import { getAppOverlayRouteMetadata } from './app-overlay-route-types';
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
  if (__DEV__) {
    // W1 slice 1 (C2): entry-keyed mounted child bodies receive THEIR entry as a prop from the
    // mount unit — a topmost-per-key read here renders the WRONG entry once two entries of the
    // key are live (the drill loop). Scoped to child scenes whose body is a static mounted
    // body (role 'child' + staticSceneInput) so key-existence checks on other children (e.g.
    // 'restaurant') stay warning-free.
    const metadata = getAppOverlayRouteMetadata(sceneKey);
    if (metadata.role === 'child' && metadata.staticSceneInput) {
      // eslint-disable-next-line no-console
      console.warn(
        `[entry-mounts] useTopMostRouteEntryForScene('${sceneKey}') called for an entry-keyed ` +
          'child scene — read the entry from the mount unit props instead (topmost-per-key is ' +
          'wrong with two live entries of one key).'
      );
    }
  }
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
