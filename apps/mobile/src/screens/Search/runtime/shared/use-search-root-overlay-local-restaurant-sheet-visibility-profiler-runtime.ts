import React from 'react';

import { createSearchOverlayLocalRestaurantSheetRenderVisibilityStateController } from '../controller/search-overlay-local-restaurant-sheet-render-visibility-state-controller';
import type { SearchOverlayLocalRestaurantSheetProfilerGateSnapshot } from './search-overlay-local-restaurant-sheet-profiler-gate-snapshot-contract';
import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetPresenceControllers,
  SearchRootOverlayLocalRestaurantSheetVisibilityProfilerRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRuntimeControllerRuntime } from './use-search-runtime-controller-runtime';
import { useSnapshotAuthority } from './use-snapshot-authority';

export const useSearchRootOverlayLocalRestaurantSheetVisibilityProfilerRuntime = ({
  routeOverlayVisibilityAuthority,
  overlayGateSnapshot,
}: Pick<
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  'routeOverlayVisibilityAuthority' | 'overlayGateSnapshot'
>): SearchRootOverlayLocalRestaurantSheetVisibilityProfilerRuntime &
  Pick<
    SearchRootOverlayLocalRestaurantSheetPresenceControllers,
    'localRestaurantSheetRenderVisibilityAuthority' | 'localRestaurantSheetProfilerGateAuthority'
  > => {
  const localRestaurantSheetRenderVisibilityController = useSearchRuntimeControllerRuntime(() =>
    createSearchOverlayLocalRestaurantSheetRenderVisibilityStateController({
      routeOverlayVisibilityAuthority,
    })
  );
  const profilerGateSnapshot = React.useMemo<SearchOverlayLocalRestaurantSheetProfilerGateSnapshot>(
    () => ({
      onProfilerRender: overlayGateSnapshot.onProfilerRender,
    }),
    [overlayGateSnapshot.onProfilerRender]
  );
  const localRestaurantSheetProfilerGateAuthority = useSnapshotAuthority(profilerGateSnapshot);

  return {
    localRestaurantSheetRenderVisibilityAuthority:
      localRestaurantSheetRenderVisibilityController.outputAuthority,
    localRestaurantSheetProfilerGateAuthority,
  };
};
