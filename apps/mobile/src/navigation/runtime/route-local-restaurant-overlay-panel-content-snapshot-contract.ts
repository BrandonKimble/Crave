import type { SharedValue } from 'react-native-reanimated';

import type { RestaurantPanelSnapshot } from './app-route-profile-transition-state-contract';

export type RouteLocalRestaurantOverlayPanelContentSnapshot = {
  restaurantPanelSnapshot: RestaurantPanelSnapshot | null;
  suggestionProgress: SharedValue<number> | null;
};

export const EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_PANEL_CONTENT_SNAPSHOT: RouteLocalRestaurantOverlayPanelContentSnapshot =
  {
    restaurantPanelSnapshot: null,
    suggestionProgress: null,
  };

export const areRouteLocalRestaurantOverlayPanelContentSnapshotsEqual = (
  left: RouteLocalRestaurantOverlayPanelContentSnapshot,
  right: RouteLocalRestaurantOverlayPanelContentSnapshot
): boolean =>
  left.restaurantPanelSnapshot === right.restaurantPanelSnapshot &&
  left.suggestionProgress === right.suggestionProgress;
