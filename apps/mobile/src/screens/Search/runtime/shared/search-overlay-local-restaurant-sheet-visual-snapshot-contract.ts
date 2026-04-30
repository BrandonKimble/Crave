import type React from 'react';

import type { RouteHostOverlayGeometryBinding } from '../../../../navigation/runtime/route-host-overlay-geometry-state-controller';
import type { RouteResultsSheetVisualBinding } from '../../../../navigation/runtime/route-results-sheet-visual-state-controller';
import type { RouteHostVisualRuntime } from '../../../../navigation/runtime/route-host-visual-runtime-state-controller';

export type SearchOverlayLocalRestaurantRouteVisualSnapshot = {
  overlayGeometryRuntime: NonNullable<RouteHostOverlayGeometryBinding>;
  resultsSheetRuntimeOwner: NonNullable<RouteResultsSheetVisualBinding>;
  visualRuntime: NonNullable<RouteHostVisualRuntime>;
};

export type SearchOverlayLocalRestaurantSheetVisualSnapshot = {
  shouldRenderSearchOverlay: boolean;
  routeHostVisualSnapshot: SearchOverlayLocalRestaurantRouteVisualSnapshot | null;
  onProfilerRender: React.ProfilerOnRenderCallback | null;
};
