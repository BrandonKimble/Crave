import type { SharedValue } from 'react-native-reanimated';

import type { RestaurantPanelSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

const NOOP = (): void => undefined;
const NOOP_TOGGLE_FAVORITE = (_id: string): void => undefined;

export type RouteLocalRestaurantOverlayControlSelectionSnapshot = {
  restaurantPanelSnapshot: RestaurantPanelSnapshot | null;
  suggestionProgress: SharedValue<number> | null;
  shouldSuppressRestaurantOverlay: boolean;
  shouldFreezeRestaurantPanelContent: boolean;
  shouldEnableRestaurantOverlayInteraction: boolean;
  onToggleFavorite: (id: string, locationId?: string | null) => void;
  closeRestaurantProfile: () => void;
};

export const EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_CONTROL_SELECTION_SNAPSHOT: RouteLocalRestaurantOverlayControlSelectionSnapshot =
  {
    restaurantPanelSnapshot: null,
    suggestionProgress: null,
    shouldSuppressRestaurantOverlay: false,
    shouldFreezeRestaurantPanelContent: false,
    shouldEnableRestaurantOverlayInteraction: false,
    onToggleFavorite: NOOP_TOGGLE_FAVORITE,
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
  left.onToggleFavorite === right.onToggleFavorite &&
  left.closeRestaurantProfile === right.closeRestaurantProfile;
