import type { OverlayKey } from '../../overlays/types';
import type { OverlayRouteEntry } from './app-overlay-route-types';
import { ROOT_SEARCH_ROUTE_ENTRY } from './app-overlay-route-stack-algebra';

export type RouteLocalRestaurantOverlaySessionSnapshot = {
  activeOverlayRoute: OverlayRouteEntry;
  activeOverlayRouteKey: OverlayKey;
  rootOverlayKey: OverlayKey;
  overlayRouteStackLength: number;
};

export const EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_SESSION_SNAPSHOT: RouteLocalRestaurantOverlaySessionSnapshot =
  {
    activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
    activeOverlayRouteKey: 'search',
    rootOverlayKey: 'search',
    overlayRouteStackLength: 1,
  };
