import type {
  CameraSnapshot,
  ProfileTransitionState,
  RestaurantPanelSnapshot,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type {
  ProfilePresentationModel,
  ProfileViewState,
} from './profile-presentation-model-runtime';

export const resolveProfilePresentationModel = ({
  transitionStatus,
  hasRestaurantRouteEntry,
  restaurantPanelSnapshot,
}: {
  transitionStatus: ProfileTransitionState['status'];
  /** L3 cutover slice 1: the ROUTE-STACK fact (a 'restaurant' entry exists). The
   *  presence-shaped facts below derive from THIS, not the machine's transitionStatus —
   *  the stack fact is the more correct signal (S-C.5 slice-A measurement: divergence is
   *  one frame, close-side only) and survives the machine's deletion. isTransitionAnimating
   *  stays on transitionStatus until the deletion slice re-feeds it from the PF switch
   *  in-flight signal. */
  hasRestaurantRouteEntry: boolean;
  restaurantPanelSnapshot: RestaurantPanelSnapshot | null;
}): ProfilePresentationModel => {
  const isTransitionAnimating = transitionStatus === 'opening' || transitionStatus === 'closing';
  const isOverlayVisible = hasRestaurantRouteEntry;
  const isPresentationActive = hasRestaurantRouteEntry || restaurantPanelSnapshot != null;
  const activeOpenRestaurantId = isOverlayVisible
    ? (restaurantPanelSnapshot?.restaurant.restaurantId ?? null)
    : null;

  return {
    transitionStatus,
    isTransitionAnimating,
    isOverlayVisible,
    isPresentationActive,
    activeOpenRestaurantId,
  };
};

export const resolveProfileViewState = ({
  transitionStatus,
  hasRestaurantRouteEntry,
  restaurantPanelSnapshot,
  mapCameraPadding,
  mapHighlightedRestaurantId,
}: {
  transitionStatus: ProfileTransitionState['status'];
  hasRestaurantRouteEntry: boolean;
  restaurantPanelSnapshot: RestaurantPanelSnapshot | null;
  mapCameraPadding: CameraSnapshot['padding'];
  mapHighlightedRestaurantId: string | null;
}): ProfileViewState => ({
  presentation: resolveProfilePresentationModel({
    transitionStatus,
    hasRestaurantRouteEntry,
    restaurantPanelSnapshot,
  }),
  highlightedRestaurantId: mapHighlightedRestaurantId,
  restaurantPanelSnapshot,
  mapCameraPadding,
});
