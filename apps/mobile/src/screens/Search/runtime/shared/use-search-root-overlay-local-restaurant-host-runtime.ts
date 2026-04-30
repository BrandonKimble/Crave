import React from 'react';

import type {
  SearchRootOverlayHostRuntimeParams,
  SearchRootOverlayLocalRestaurantHostRuntime,
} from './search-root-overlay-host-runtime-contract';
import type { SearchOverlayHostGateSnapshot } from './search-overlay-host-gate-snapshot-contract';
import { useSearchRootOverlayLocalRestaurantRouteHostRuntime } from './use-search-root-overlay-local-restaurant-route-host-runtime';
import { useSearchRootOverlayLocalRestaurantSheetHostRuntime } from './use-search-root-overlay-local-restaurant-sheet-host-runtime';

export const useSearchRootOverlayLocalRestaurantHostRuntime = ({
  routeLocalRestaurantOverlaySessionAuthority,
  routeLocalRestaurantOverlayPanelContentAuthority,
  routeLocalRestaurantOverlayPolicyAuthority,
  routeLocalRestaurantOverlayInteractionAuthority,
  routeOverlayVisibilityAuthority,
  routeHostOverlayGeometryAuthority,
  routeResultsSheetVisualAuthority,
  routeHostVisualRuntimeAuthority,
  overlayGateSnapshot,
}: Pick<
  SearchRootOverlayHostRuntimeParams,
  | 'routeLocalRestaurantOverlaySessionAuthority'
  | 'routeLocalRestaurantOverlayPanelContentAuthority'
  | 'routeLocalRestaurantOverlayPolicyAuthority'
  | 'routeLocalRestaurantOverlayInteractionAuthority'
  | 'routeOverlayVisibilityAuthority'
  | 'routeHostOverlayGeometryAuthority'
  | 'routeResultsSheetVisualAuthority'
  | 'routeHostVisualRuntimeAuthority'
> & {
  overlayGateSnapshot: SearchOverlayHostGateSnapshot;
}): SearchRootOverlayLocalRestaurantHostRuntime => {
  const localRestaurantRouteHostRuntime = useSearchRootOverlayLocalRestaurantRouteHostRuntime({
    routeHostOverlayGeometryAuthority,
    routeResultsSheetVisualAuthority,
    routeHostVisualRuntimeAuthority,
  });
  const localRestaurantSheetHostRuntime = useSearchRootOverlayLocalRestaurantSheetHostRuntime({
    routeOverlayVisibilityAuthority,
    routeLocalRestaurantOverlaySessionAuthority,
    routeLocalRestaurantOverlayPanelContentAuthority,
    routeLocalRestaurantOverlayPolicyAuthority,
    routeLocalRestaurantOverlayInteractionAuthority,
    overlayGateSnapshot,
    localRestaurantRouteVisualAuthority:
      localRestaurantRouteHostRuntime.localRestaurantRouteVisualAuthority,
  });

  return React.useMemo(
    () => ({
      overlayLocalRestaurantSheetHostAuthority:
        localRestaurantSheetHostRuntime.overlayLocalRestaurantSheetHostAuthority,
    }),
    [localRestaurantSheetHostRuntime.overlayLocalRestaurantSheetHostAuthority]
  );
};
