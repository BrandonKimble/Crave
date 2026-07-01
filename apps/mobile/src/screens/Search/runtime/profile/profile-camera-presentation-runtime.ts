import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

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

// Centers the focus pin in the visible band between the search-bar bottom edge and the sheet's TOP
// edge at the MIDDLE snap — the area the sheet does not cover at the middle snap. Mapbox centers a
// coordinate in the region left unpadded, so:
//   paddingTop    = searchBarBottom  (searchBarTop + searchBarHeight)
//   paddingBottom = screenHeight - middleSnapPoint  (the area the middle-snap sheet covers)
// → the unpadded vertical region IS the band, and the focus coordinate lands at its center. This is
// the SHARED fix → every restaurant-profile reveal (comment/entity reveal AND the result-card tap)
// inherits the same band centering.
export const resolveProfileCameraPadding = ({
  screenHeight,
  searchBarTop,
  searchBarHeight,
  insetsTop,
  middleSnapPoint,
  profilePinMinVisibleHeight,
}: {
  screenHeight: number;
  searchBarTop: number;
  searchBarHeight: number;
  insetsTop: number;
  middleSnapPoint: number;
  profilePinMinVisibleHeight: number;
}): CameraSnapshot['padding'] => {
  // Band top = the search-bar bottom edge. The search bar already sits below the safe-area inset, so
  // the safe-area `insetsTop` is only a defensive floor for the (unmeasured) zero-height case — NOT
  // the bottom-nav silhouette snap top (`navBarTop`, a near-screen-bottom value that must never floor
  // the TOP padding).
  const searchBarBottom = Math.max(searchBarTop + searchBarHeight, insetsTop);
  const topPadding = searchBarBottom;
  // The middle-snap sheet top is the band's lower edge. Guard against a degenerate / unmeasured snap
  // by ensuring the band is at least `profilePinMinVisibleHeight` tall below the search bar.
  const minBandBottom = topPadding + profilePinMinVisibleHeight;
  const bandBottom =
    Number.isFinite(middleSnapPoint) && middleSnapPoint > minBandBottom
      ? middleSnapPoint
      : minBandBottom;
  const bottomPadding = Math.max(screenHeight - bandBottom, 0);
  return {
    paddingTop: topPadding,
    paddingBottom: bottomPadding,
    paddingLeft: 0,
    paddingRight: 0,
  };
};
