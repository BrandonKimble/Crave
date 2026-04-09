import type { PreparedProfilePresentationSnapshot } from '../shared/prepared-presentation-transaction';
import type {
  CameraSnapshot,
  ProfileTransitionState,
  RestaurantPanelSnapshot,
} from './profile-transition-state-contract';
import type {
  ProfilePresentationModel,
  ProfileViewState,
} from './profile-presentation-model-runtime';

export const resolveProfilePresentationModel = ({
  transitionStatus,
  restaurantPanelSnapshot,
  preparedSnapshot,
}: {
  transitionStatus: ProfileTransitionState['status'];
  restaurantPanelSnapshot: RestaurantPanelSnapshot | null;
  preparedSnapshot: PreparedProfilePresentationSnapshot | null;
}): ProfilePresentationModel => {
  const shouldExposePreparedSnapshotKey =
    preparedSnapshot != null &&
    (transitionStatus === 'opening' ||
      transitionStatus === 'closing' ||
      (transitionStatus === 'open' && restaurantPanelSnapshot != null));
  const preparedSnapshotKey =
    shouldExposePreparedSnapshotKey && preparedSnapshot != null
      ? preparedSnapshot.kind === 'profile_close'
        ? `${preparedSnapshot.transactionId}:close:${preparedSnapshot.restaurantId ?? 'none'}`
        : `${preparedSnapshot.transactionId}:open:${preparedSnapshot.restaurantId ?? 'none'}`
      : null;
  const isTransitionAnimating = transitionStatus === 'opening' || transitionStatus === 'closing';
  const isOverlayVisible = transitionStatus === 'opening' || transitionStatus === 'open';
  const isPresentationActive = transitionStatus !== 'idle' || restaurantPanelSnapshot != null;
  const activeOpenRestaurantId = isOverlayVisible
    ? restaurantPanelSnapshot?.restaurant.restaurantId ?? null
    : null;

  return {
    transitionStatus,
    isTransitionAnimating,
    isOverlayVisible,
    isPresentationActive,
    activeOpenRestaurantId,
    preparedSnapshotKey,
  };
};

export const resolveProfileViewState = ({
  transitionStatus,
  restaurantPanelSnapshot,
  mapCameraPadding,
  mapHighlightedRestaurantId,
  preparedSnapshot,
}: {
  transitionStatus: ProfileTransitionState['status'];
  restaurantPanelSnapshot: RestaurantPanelSnapshot | null;
  mapCameraPadding: CameraSnapshot['padding'];
  mapHighlightedRestaurantId: string | null;
  preparedSnapshot: PreparedProfilePresentationSnapshot | null;
}): ProfileViewState => ({
  presentation: resolveProfilePresentationModel({
    transitionStatus,
    restaurantPanelSnapshot,
    preparedSnapshot,
  }),
  highlightedRestaurantId: mapHighlightedRestaurantId,
  restaurantPanelSnapshot,
  mapCameraPadding,
});
