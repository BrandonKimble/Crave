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
  isRestaurantSwitchInFlight,
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
  /** RT-2: the PF in-flight fact (an animating switch whose target or outgoing scene is
   *  'restaurant') — the promised re-feed. transitionStatus no longer carries animation. */
  isRestaurantSwitchInFlight: boolean;
  restaurantPanelSnapshot: RestaurantPanelSnapshot | null;
}): ProfilePresentationModel => {
  const isTransitionAnimating = isRestaurantSwitchInFlight;
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
  isRestaurantSwitchInFlight,
  restaurantPanelSnapshot,
  mapCameraPadding,
  mapHighlightedRestaurantId,
}: {
  transitionStatus: ProfileTransitionState['status'];
  hasRestaurantRouteEntry: boolean;
  isRestaurantSwitchInFlight: boolean;
  restaurantPanelSnapshot: RestaurantPanelSnapshot | null;
  mapCameraPadding: CameraSnapshot['padding'];
  mapHighlightedRestaurantId: string | null;
}): ProfileViewState => ({
  presentation: resolveProfilePresentationModel({
    transitionStatus,
    hasRestaurantRouteEntry,
    isRestaurantSwitchInFlight,
    restaurantPanelSnapshot,
  }),
  highlightedRestaurantId: mapHighlightedRestaurantId,
  restaurantPanelSnapshot,
  mapCameraPadding,
});
