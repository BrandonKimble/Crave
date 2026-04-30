import {
  EMPTY_APP_OVERLAY_RESTAURANT_INPUTS,
  type AppOverlayRestaurantInputs,
} from './app-route-restaurant-overlay-input-contract';
import type { RestaurantPanelSnapshot } from './app-route-profile-transition-state-contract';

export type AppRouteRestaurantOverlayPanelContentPublication = {
  restaurantPanelSnapshot: RestaurantPanelSnapshot | null;
  suggestionProgress: AppOverlayRestaurantInputs['suggestionProgress'];
};

export const EMPTY_APP_ROUTE_RESTAURANT_OVERLAY_PANEL_CONTENT_PUBLICATION: AppRouteRestaurantOverlayPanelContentPublication =
  {
    restaurantPanelSnapshot: null,
    suggestionProgress: EMPTY_APP_OVERLAY_RESTAURANT_INPUTS.suggestionProgress,
  };

export type AppRouteRestaurantOverlayPolicyPublication = {
  shouldSuppressRestaurantOverlay: AppOverlayRestaurantInputs['shouldSuppressRestaurantOverlay'];
  shouldFreezeRestaurantPanelContent: AppOverlayRestaurantInputs['shouldFreezeRestaurantPanelContent'];
  shouldEnableRestaurantOverlayInteraction: AppOverlayRestaurantInputs['shouldEnableRestaurantOverlayInteraction'];
};

export type AppRouteRestaurantOverlayInteractionPublication = {
  onToggleFavorite: AppOverlayRestaurantInputs['onToggleFavorite'];
  closeRestaurantProfile: AppOverlayRestaurantInputs['closeRestaurantProfile'];
  restaurantSheetSnapController: AppOverlayRestaurantInputs['restaurantSheetSnapController'];
};

export const EMPTY_APP_ROUTE_RESTAURANT_OVERLAY_POLICY_PUBLICATION: AppRouteRestaurantOverlayPolicyPublication =
  {
    shouldSuppressRestaurantOverlay:
      EMPTY_APP_OVERLAY_RESTAURANT_INPUTS.shouldSuppressRestaurantOverlay,
    shouldFreezeRestaurantPanelContent:
      EMPTY_APP_OVERLAY_RESTAURANT_INPUTS.shouldFreezeRestaurantPanelContent,
    shouldEnableRestaurantOverlayInteraction:
      EMPTY_APP_OVERLAY_RESTAURANT_INPUTS.shouldEnableRestaurantOverlayInteraction,
  };

export const EMPTY_APP_ROUTE_RESTAURANT_OVERLAY_INTERACTION_PUBLICATION: AppRouteRestaurantOverlayInteractionPublication =
  {
    onToggleFavorite: EMPTY_APP_OVERLAY_RESTAURANT_INPUTS.onToggleFavorite,
    closeRestaurantProfile: EMPTY_APP_OVERLAY_RESTAURANT_INPUTS.closeRestaurantProfile,
    restaurantSheetSnapController:
      EMPTY_APP_OVERLAY_RESTAURANT_INPUTS.restaurantSheetSnapController,
  };

export type AppRouteRestaurantOverlayPanelContentPublicationLane = {
  syncRouteRestaurantOverlayPanelContentPublication: (
    routeRestaurantOverlayPanelContentPublication: AppRouteRestaurantOverlayPanelContentPublication
  ) => void;
};

export type AppRouteRestaurantOverlayPolicyPublicationLane = {
  syncRouteRestaurantOverlayPolicyPublication: (
    routeRestaurantOverlayPolicyPublication: AppRouteRestaurantOverlayPolicyPublication
  ) => void;
};

export type AppRouteRestaurantOverlayInteractionPublicationLane = {
  syncRouteRestaurantOverlayInteractionPublication: (
    routeRestaurantOverlayInteractionPublication: AppRouteRestaurantOverlayInteractionPublication
  ) => void;
};
