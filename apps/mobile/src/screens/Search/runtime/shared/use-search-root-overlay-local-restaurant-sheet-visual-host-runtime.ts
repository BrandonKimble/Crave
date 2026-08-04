import React from 'react';

import { createSearchOverlayLocalRestaurantSheetVisualStateController } from '../controller/search-overlay-local-restaurant-sheet-visual-state-controller';
import type { SearchOverlayLocalRestaurantSheetProfilerGateSnapshot } from './search-overlay-local-restaurant-sheet-profiler-gate-snapshot-contract';
import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetVisualRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRuntimeControllerRuntime } from './use-search-runtime-controller-runtime';
import { useSnapshotAuthority } from './use-snapshot-authority';

/**
 * F958 Cluster A: the SheetVisual/Presence authority, wired once.
 *
 * This replaces a six-hook chain (visibility-profiler → presence-authority → presence →
 * render-visual → route-host-visual → visual-host) that owned four controllers between the
 * three sources and one snapshot. The profiler-gate memo survives because it OWNS
 * something — it turns a loose callback on the gate snapshot into a stable authority.
 */
export const useSearchRootOverlayLocalRestaurantSheetVisualHostRuntime = ({
  routeOverlayVisibilityAuthority,
  overlayGateSnapshot,
  localRestaurantRouteVisualAuthority,
}: Pick<
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  'routeOverlayVisibilityAuthority' | 'overlayGateSnapshot' | 'localRestaurantRouteVisualAuthority'
>): SearchRootOverlayLocalRestaurantSheetVisualRuntime => {
  const profilerGateSnapshot = React.useMemo<SearchOverlayLocalRestaurantSheetProfilerGateSnapshot>(
    () => ({
      onProfilerRender: overlayGateSnapshot.onProfilerRender,
    }),
    [overlayGateSnapshot.onProfilerRender]
  );
  const localRestaurantSheetProfilerGateAuthority = useSnapshotAuthority(profilerGateSnapshot);
  const localRestaurantSheetVisualController = useSearchRuntimeControllerRuntime(() =>
    createSearchOverlayLocalRestaurantSheetVisualStateController({
      routeOverlayVisibilityAuthority,
      localRestaurantSheetProfilerGateAuthority,
      localRestaurantRouteVisualAuthority,
    })
  );

  return {
    localRestaurantSheetVisualHostAuthority: localRestaurantSheetVisualController.outputAuthority,
  };
};
