import type { OverlayKey } from '../../overlays/types';
import type { OverlayRouteEntry } from './app-overlay-route-types';

export type RouteLocalRestaurantOverlaySessionSnapshot = {
  activeOverlayRoute: OverlayRouteEntry;
  activeOverlayRouteKey: OverlayKey;
  rootOverlayKey: OverlayKey;
  overlayRouteStackLength: number;
};

export const EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_SESSION_SNAPSHOT: RouteLocalRestaurantOverlaySessionSnapshot =
  {
    activeOverlayRoute: {
      key: 'search',
      params: undefined,
    },
    activeOverlayRouteKey: 'search',
    rootOverlayKey: 'search',
    overlayRouteStackLength: 1,
  };
