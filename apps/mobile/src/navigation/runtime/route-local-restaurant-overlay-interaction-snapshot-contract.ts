import type { RestaurantRouteHostSnapController } from '../../overlays/restaurantRouteHostContract';

const NOOP = (): void => undefined;
const NOOP_TOGGLE_FAVORITE = (_id: string): void => undefined;

export type RouteLocalRestaurantOverlayInteractionSnapshot = {
  onToggleFavorite: (id: string) => void;
  closeRestaurantProfile: () => void;
  restaurantSheetSnapController: RestaurantRouteHostSnapController | null;
};

export const EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_INTERACTION_SNAPSHOT: RouteLocalRestaurantOverlayInteractionSnapshot =
  {
    onToggleFavorite: NOOP_TOGGLE_FAVORITE,
    closeRestaurantProfile: NOOP,
    restaurantSheetSnapController: null,
  };

export const areRouteLocalRestaurantOverlayInteractionSnapshotsEqual = (
  left: RouteLocalRestaurantOverlayInteractionSnapshot,
  right: RouteLocalRestaurantOverlayInteractionSnapshot
): boolean =>
  left.onToggleFavorite === right.onToggleFavorite &&
  left.closeRestaurantProfile === right.closeRestaurantProfile &&
  left.restaurantSheetSnapController === right.restaurantSheetSnapController;
