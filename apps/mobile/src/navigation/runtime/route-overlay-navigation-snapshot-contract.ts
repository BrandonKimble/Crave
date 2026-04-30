import type { OverlayKey } from '../../overlays/types';
import type { OverlayRouteEntry } from './app-overlay-route-types';

export type RouteOverlayNavigationSnapshot = {
  activeOverlayRoute: OverlayRouteEntry;
  overlayRouteStack: readonly OverlayRouteEntry[];
  activeOverlayRouteKey: OverlayKey;
  rootOverlayKey: OverlayKey;
  overlayRouteStackLength: number;
  isSearchOverlay: boolean;
  isPersistentPollLane: boolean;
};

export type RouteOverlayIdentitySnapshot = {
  activeOverlayRouteKey: OverlayKey;
  rootOverlayKey: OverlayKey;
  isSearchOverlay: boolean;
};

export const EMPTY_ROUTE_OVERLAY_NAVIGATION_SNAPSHOT: RouteOverlayNavigationSnapshot = {
  activeOverlayRoute: {
    key: 'search',
    params: undefined,
  },
  overlayRouteStack: [
    {
      key: 'search',
      params: undefined,
    },
  ],
  activeOverlayRouteKey: 'search',
  rootOverlayKey: 'search',
  overlayRouteStackLength: 1,
  isSearchOverlay: true,
  isPersistentPollLane: false,
};

export const EMPTY_ROUTE_OVERLAY_IDENTITY_SNAPSHOT: RouteOverlayIdentitySnapshot = {
  activeOverlayRouteKey: 'search',
  rootOverlayKey: 'search',
  isSearchOverlay: true,
};
