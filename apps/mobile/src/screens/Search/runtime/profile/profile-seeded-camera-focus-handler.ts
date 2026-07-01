import type { RestaurantResult } from '../../../../types';
import type { SearchProfileSource } from './profile-action-model-contract';

// Bridges the profile hydration runtime (which publishes the seeded map marker) to the camera-focus
// action. The action is constructed AFTER the hydration runtime (ordering in profile-owner-runtime),
// so the owner registers it here once built, and the hydration calls focusSeededMarkerCamera when a
// profile opened without a coordinate (the autocomplete/comment fast-path) lands its geometry. The
// underlying camera motion is idempotent — it no-ops when the camera is already on the restaurant
// (results/map-pin opens that already focused), so calling it on every hydration is safe.
type SeededCameraFocusHandler = (restaurant: RestaurantResult, source: SearchProfileSource) => void;

let seededCameraFocusHandler: SeededCameraFocusHandler | null = null;

export const registerSeededMarkerCameraFocusHandler = (
  handler: SeededCameraFocusHandler | null
): void => {
  seededCameraFocusHandler = handler;
};

export const focusSeededMarkerCamera = (restaurant: RestaurantResult): void => {
  seededCameraFocusHandler?.(restaurant, 'autocomplete');
};
