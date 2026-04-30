import type { GlobalRestaurantRouteDraft } from '../../overlays/restaurantRoutePanelContract';
import type { OverlayKey } from '../../overlays/types';

export type RouteGlobalRestaurantOverlaySnapshot = {
  presentationDraft: GlobalRestaurantRouteDraft | null;
  activeSessionToken: number | null;
  activeOverlayRouteKey: OverlayKey;
  rootOverlayKey: OverlayKey;
  overlayRouteStackLength: number;
};

export const EMPTY_ROUTE_GLOBAL_RESTAURANT_OVERLAY_SNAPSHOT: RouteGlobalRestaurantOverlaySnapshot =
  {
    presentationDraft: null,
    activeSessionToken: null,
    activeOverlayRouteKey: 'search',
    rootOverlayKey: 'search',
    overlayRouteStackLength: 1,
  };
