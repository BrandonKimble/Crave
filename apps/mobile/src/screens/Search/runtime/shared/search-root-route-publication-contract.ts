import type { RouteHostOverlayGeometryBinding } from './route-authority-contract';
import type { AppRouteHostVisualRuntime } from '../../../../navigation/runtime/app-route-host-visual-runtime-contract';
import {
  EMPTY_APP_ROUTE_RESTAURANT_OVERLAY_INTERACTION_PUBLICATION,
  EMPTY_APP_ROUTE_RESTAURANT_OVERLAY_POLICY_PUBLICATION,
  EMPTY_APP_ROUTE_RESTAURANT_OVERLAY_PANEL_CONTENT_PUBLICATION,
} from '../../../../navigation/runtime/app-route-restaurant-overlay-publication-contract';
import type {
  AppRouteRestaurantOverlayInteractionPublication,
  AppRouteRestaurantOverlayInteractionPublicationLane,
  AppRouteRestaurantOverlayPolicyPublication,
  AppRouteRestaurantOverlayPolicyPublicationLane,
  AppRouteRestaurantOverlayPanelContentPublication,
  AppRouteRestaurantOverlayPanelContentPublicationLane,
} from '../../../../navigation/runtime/app-route-restaurant-overlay-publication-contract';

export type SearchRootRouteHostPublication = {
  routeHostOverlayGeometryRuntime: RouteHostOverlayGeometryBinding;
  routeHostVisualRuntime: AppRouteHostVisualRuntime | null;
};

export const EMPTY_SEARCH_ROOT_ROUTE_HOST_PUBLICATION: SearchRootRouteHostPublication = {
  routeHostOverlayGeometryRuntime: null,
  routeHostVisualRuntime: null,
};

export type SearchRootRouteRestaurantOverlayPanelContentPublication =
  AppRouteRestaurantOverlayPanelContentPublication;

export const EMPTY_SEARCH_ROOT_ROUTE_RESTAURANT_OVERLAY_PANEL_CONTENT_PUBLICATION: SearchRootRouteRestaurantOverlayPanelContentPublication =
  EMPTY_APP_ROUTE_RESTAURANT_OVERLAY_PANEL_CONTENT_PUBLICATION;

export type SearchRootRouteRestaurantOverlayPolicyPublication =
  AppRouteRestaurantOverlayPolicyPublication;

export type SearchRootRouteRestaurantOverlayInteractionPublication =
  AppRouteRestaurantOverlayInteractionPublication;

export const EMPTY_SEARCH_ROOT_ROUTE_RESTAURANT_OVERLAY_POLICY_PUBLICATION: SearchRootRouteRestaurantOverlayPolicyPublication =
  EMPTY_APP_ROUTE_RESTAURANT_OVERLAY_POLICY_PUBLICATION;

export const EMPTY_SEARCH_ROOT_ROUTE_RESTAURANT_OVERLAY_INTERACTION_PUBLICATION: SearchRootRouteRestaurantOverlayInteractionPublication =
  EMPTY_APP_ROUTE_RESTAURANT_OVERLAY_INTERACTION_PUBLICATION;

export type SearchRootRouteVisualHostPublicationLane = {
  syncRouteHostPublication: (routeHostPublication: SearchRootRouteHostPublication) => void;
};

export type SearchRootRouteRestaurantOverlayPanelContentPublicationLane =
  AppRouteRestaurantOverlayPanelContentPublicationLane;

export type SearchRootRouteRestaurantOverlayPolicyPublicationLane =
  AppRouteRestaurantOverlayPolicyPublicationLane;

export type SearchRootRouteRestaurantOverlayInteractionPublicationLane =
  AppRouteRestaurantOverlayInteractionPublicationLane;
