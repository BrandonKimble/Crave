import type { CameraSnapshot } from './profile-transition-state-contract';

export const resolveProfileCameraSnapshot = ({
  currentLastCameraState,
  mapCenter,
  mapZoom,
  fallbackCenter,
  fallbackZoom,
  mapCameraPadding,
}: {
  currentLastCameraState: { center: [number, number]; zoom: number } | null;
  mapCenter: [number, number] | null;
  mapZoom: number | null;
  fallbackCenter: [number, number];
  fallbackZoom: number;
  mapCameraPadding: CameraSnapshot['padding'];
}): CameraSnapshot | null => {
  const center = currentLastCameraState?.center ?? mapCenter ?? fallbackCenter;
  const zoom = currentLastCameraState?.zoom ?? mapZoom ?? fallbackZoom;
  if (!center || typeof zoom !== 'number' || !Number.isFinite(zoom)) {
    return null;
  }
  return {
    center: [center[0], center[1]],
    zoom,
    padding: mapCameraPadding ? { ...mapCameraPadding } : null,
  };
};

export const resolveProfileCameraPadding = ({
  screenHeight,
  searchBarTop,
  searchBarHeight,
  insetsTop,
  navBarTop,
  profilePinTargetCenterRatio,
  profilePinMinVisibleHeight,
}: {
  screenHeight: number;
  searchBarTop: number;
  searchBarHeight: number;
  insetsTop: number;
  navBarTop: number;
  profilePinTargetCenterRatio: number;
  profilePinMinVisibleHeight: number;
}): CameraSnapshot['padding'] => {
  const topInset = Math.max(insetsTop, navBarTop);
  const topPadding = Math.max(searchBarTop + searchBarHeight, topInset);
  const desiredCenter = screenHeight * profilePinTargetCenterRatio;
  const minCenter = topPadding + profilePinMinVisibleHeight / 2;
  const targetCenter = Math.max(desiredCenter, minCenter);
  const bottomPadding = Math.max(screenHeight + topPadding - 2 * targetCenter, 0);
  return {
    paddingTop: topPadding,
    paddingBottom: bottomPadding,
    paddingLeft: 0,
    paddingRight: 0,
  };
};
