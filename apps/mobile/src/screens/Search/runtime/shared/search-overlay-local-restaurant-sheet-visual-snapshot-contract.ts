import type React from 'react';

import type { RouteHostOverlayGeometryBinding } from '../../../../navigation/runtime/route-host-overlay-geometry-state-controller';
import type { RouteSharedSheetVisualBinding } from '../../../../navigation/runtime/route-shared-sheet-visual-state-controller';
import type { RouteHostVisualRuntime } from '../../../../navigation/runtime/route-host-visual-runtime-state-controller';

export type SearchOverlayLocalRestaurantRouteVisualSnapshot = {
  overlayGeometryRuntime: NonNullable<RouteHostOverlayGeometryBinding>;
  sharedSheetRuntimeOwner: NonNullable<RouteSharedSheetVisualBinding>;
  visualRuntime: NonNullable<RouteHostVisualRuntime>;
};

export type SearchOverlayLocalRestaurantSheetVisualSnapshot = {
  shouldRenderSearchOverlay: boolean;
  routeHostVisualSnapshot: SearchOverlayLocalRestaurantRouteVisualSnapshot | null;
  onProfilerRender: React.ProfilerOnRenderCallback | null;
};
