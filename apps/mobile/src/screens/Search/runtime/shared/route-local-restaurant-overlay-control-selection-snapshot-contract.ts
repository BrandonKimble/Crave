import type { SharedValue } from 'react-native-reanimated';

import type { RestaurantPanelSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

const NOOP = (): void => undefined;

export type RouteLocalRestaurantOverlayControlSelectionSnapshot = {
  restaurantPanelSnapshot: RestaurantPanelSnapshot | null;
  suggestionProgress: SharedValue<number> | null;
  shouldSuppressRestaurantOverlay: boolean;
  shouldFreezeRestaurantPanelContent: boolean;
  shouldEnableRestaurantOverlayInteraction: boolean;
  closeRestaurantProfile: () => void;
};

export const EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_CONTROL_SELECTION_SNAPSHOT: RouteLocalRestaurantOverlayControlSelectionSnapshot =
  {
    restaurantPanelSnapshot: null,
    suggestionProgress: null,
    shouldSuppressRestaurantOverlay: false,
    shouldFreezeRestaurantPanelContent: false,
    shouldEnableRestaurantOverlayInteraction: false,
    closeRestaurantProfile: NOOP,
  };

export const areRouteLocalRestaurantOverlayControlSelectionSnapshotsEqual = (
  left: RouteLocalRestaurantOverlayControlSelectionSnapshot,
  right: RouteLocalRestaurantOverlayControlSelectionSnapshot
): boolean =>
  left.restaurantPanelSnapshot === right.restaurantPanelSnapshot &&
  left.suggestionProgress === right.suggestionProgress &&
  left.shouldSuppressRestaurantOverlay === right.shouldSuppressRestaurantOverlay &&
  left.shouldFreezeRestaurantPanelContent === right.shouldFreezeRestaurantPanelContent &&
  left.shouldEnableRestaurantOverlayInteraction ===
    right.shouldEnableRestaurantOverlayInteraction &&
  left.closeRestaurantProfile === right.closeRestaurantProfile;
