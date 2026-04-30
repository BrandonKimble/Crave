export type RouteLocalRestaurantOverlayPolicySnapshot = {
  shouldSuppressRestaurantOverlay: boolean;
  shouldFreezeRestaurantPanelContent: boolean;
  shouldEnableRestaurantOverlayInteraction: boolean;
};

export const EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_POLICY_SNAPSHOT: RouteLocalRestaurantOverlayPolicySnapshot =
  {
    shouldSuppressRestaurantOverlay: false,
    shouldFreezeRestaurantPanelContent: false,
    shouldEnableRestaurantOverlayInteraction: false,
  };

export const areRouteLocalRestaurantOverlayPolicySnapshotsEqual = (
  left: RouteLocalRestaurantOverlayPolicySnapshot,
  right: RouteLocalRestaurantOverlayPolicySnapshot
): boolean =>
  left.shouldSuppressRestaurantOverlay === right.shouldSuppressRestaurantOverlay &&
  left.shouldFreezeRestaurantPanelContent === right.shouldFreezeRestaurantPanelContent &&
  left.shouldEnableRestaurantOverlayInteraction === right.shouldEnableRestaurantOverlayInteraction;
