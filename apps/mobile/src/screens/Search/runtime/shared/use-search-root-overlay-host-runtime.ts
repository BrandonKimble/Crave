import React from 'react';

import type {
  SearchRootOverlayHostRuntime,
  SearchRootOverlayHostRuntimeParams,
} from './search-root-overlay-host-runtime-contract';
import { useSearchRootOverlayChromeHostRuntime } from './use-search-root-overlay-chrome-host-runtime';
import { useSearchRootOverlayLocalRestaurantHostRuntime } from './use-search-root-overlay-local-restaurant-host-runtime';
import { useSearchRootOverlayShellHostRuntime } from './use-search-root-overlay-shell-host-runtime';

export const useSearchRootOverlayHostRuntime = ({
  appEntryPlaneRuntime,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  routeOverlayVisibilityAuthority,
  routeLocalRestaurantOverlaySessionAuthority,
  routeLocalRestaurantOverlayPanelContentAuthority,
  routeLocalRestaurantOverlayPolicyAuthority,
  routeLocalRestaurantOverlayInteractionAuthority,
  routeHostOverlayGeometryAuthority,
  routeResultsSheetVisualAuthority,
  routeHostVisualRuntimeAuthority,
  overlayHostVisualRuntime,
  overlaySceneHostVisualRuntime,
  foregroundInteractionControlLane,
  foregroundInputControlLane,
  filterModalControlLane,
  profileControlRuntime,
  controlAuthorityRuntime,
}: SearchRootOverlayHostRuntimeParams): SearchRootOverlayHostRuntime => {
  const overlayShellHostRuntime = useSearchRootOverlayShellHostRuntime({
    appEntryPlaneRuntime,
    rootOverlayFoundationRuntime,
    overlayHostVisualRuntime,
    filterModalControlLane,
  });
  const overlayChromeHostRuntime = useSearchRootOverlayChromeHostRuntime({
    appEntryPlaneRuntime,
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    routeOverlayVisibilityAuthority,
    overlayHostVisualRuntime,
    overlaySceneHostVisualRuntime,
    foregroundInteractionControlLane,
    foregroundInputControlLane,
    filterModalControlLane,
    profileControlRuntime,
    controlAuthorityRuntime,
  });
  const overlayLocalRestaurantHostRuntime = useSearchRootOverlayLocalRestaurantHostRuntime({
    routeLocalRestaurantOverlaySessionAuthority,
    routeLocalRestaurantOverlayPanelContentAuthority,
    routeLocalRestaurantOverlayPolicyAuthority,
    routeLocalRestaurantOverlayInteractionAuthority,
    routeOverlayVisibilityAuthority,
    routeHostOverlayGeometryAuthority,
    routeResultsSheetVisualAuthority,
    routeHostVisualRuntimeAuthority,
    overlayGateSnapshot: overlayShellHostRuntime.overlayGateSnapshot,
  });

  return React.useMemo(
    () => ({
      ...overlayShellHostRuntime,
      ...overlayChromeHostRuntime,
      ...overlayLocalRestaurantHostRuntime,
    }),
    [overlayChromeHostRuntime, overlayLocalRestaurantHostRuntime, overlayShellHostRuntime]
  );
};
