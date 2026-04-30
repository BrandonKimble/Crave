import type { SearchOverlayLocalRestaurantRouteVisualSnapshot } from './search-overlay-local-restaurant-sheet-visual-snapshot-contract';

export type SearchOverlayLocalRestaurantSheetRenderSnapshot = {
  shouldRenderSearchOverlay: boolean;
  routeHostVisualSnapshot: SearchOverlayLocalRestaurantRouteVisualSnapshot | null;
};
