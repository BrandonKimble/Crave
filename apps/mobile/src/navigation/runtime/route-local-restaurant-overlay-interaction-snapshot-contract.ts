const NOOP = (): void => undefined;
const NOOP_TOGGLE_FAVORITE = (_id: string): void => undefined;

export type RouteLocalRestaurantOverlayInteractionSnapshot = {
  onToggleFavorite: (id: string, locationId?: string | null) => void;
  closeRestaurantProfile: () => void;
};

export const EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_INTERACTION_SNAPSHOT: RouteLocalRestaurantOverlayInteractionSnapshot =
  {
    onToggleFavorite: NOOP_TOGGLE_FAVORITE,
    closeRestaurantProfile: NOOP,
  };

export const areRouteLocalRestaurantOverlayInteractionSnapshotsEqual = (
  left: RouteLocalRestaurantOverlayInteractionSnapshot,
  right: RouteLocalRestaurantOverlayInteractionSnapshot
): boolean =>
  left.onToggleFavorite === right.onToggleFavorite &&
  left.closeRestaurantProfile === right.closeRestaurantProfile;
