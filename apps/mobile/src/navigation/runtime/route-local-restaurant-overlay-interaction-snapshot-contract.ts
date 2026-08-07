const NOOP = (): void => undefined;

export type RouteLocalRestaurantOverlayInteractionSnapshot = {
  closeRestaurantProfile: () => void;
};

export const EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_INTERACTION_SNAPSHOT: RouteLocalRestaurantOverlayInteractionSnapshot =
  {
    closeRestaurantProfile: NOOP,
  };

export const areRouteLocalRestaurantOverlayInteractionSnapshotsEqual = (
  left: RouteLocalRestaurantOverlayInteractionSnapshot,
  right: RouteLocalRestaurantOverlayInteractionSnapshot
): boolean => left.closeRestaurantProfile === right.closeRestaurantProfile;
