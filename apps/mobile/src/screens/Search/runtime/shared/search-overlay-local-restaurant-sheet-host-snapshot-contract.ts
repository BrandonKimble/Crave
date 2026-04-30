import type React from 'react';

import type { RouteLocalRestaurantOverlayControlSelectionSnapshot } from './route-local-restaurant-overlay-control-selection-snapshot-contract';
import type { RouteLocalRestaurantOverlaySessionSnapshot } from '../../../../navigation/runtime/route-local-restaurant-overlay-session-snapshot-contract';
import type { SearchOverlayLocalRestaurantRouteVisualSnapshot } from './search-overlay-local-restaurant-sheet-visual-snapshot-contract';

export type SearchOverlayLocalRestaurantSheetHostSnapshot = {
  restaurantSessionSnapshot: RouteLocalRestaurantOverlaySessionSnapshot;
  restaurantControlSelectionSnapshot: RouteLocalRestaurantOverlayControlSelectionSnapshot;
  shouldRenderSearchOverlay: boolean;
  routeHostVisualSnapshot: SearchOverlayLocalRestaurantRouteVisualSnapshot | null;
  onProfilerRender: React.ProfilerOnRenderCallback | null;
};
