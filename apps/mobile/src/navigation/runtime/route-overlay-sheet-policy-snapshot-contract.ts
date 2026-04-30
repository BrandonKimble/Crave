import type { SearchRouteOverlaySheetPolicy } from '../../overlays/searchRouteOverlayRuntimeContract';

export type RouteOverlaySheetPolicySnapshot = {
  overlaySheetPolicy: SearchRouteOverlaySheetPolicy | null;
};

export const EMPTY_ROUTE_OVERLAY_SHEET_POLICY_SNAPSHOT: RouteOverlaySheetPolicySnapshot = {
  overlaySheetPolicy: null,
};
