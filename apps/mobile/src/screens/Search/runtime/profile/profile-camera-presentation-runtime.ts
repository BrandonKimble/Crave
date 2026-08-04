import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

// D56: `resolveProfileCameraSnapshot` lived here and is DELETED (F1506/F1507). It built the
// profile lane's `savedCamera` and preferred `lastCameraStateRef` — the idle-only tracker that
// lags programmatic moves — over every other source, so a profile opened mid-fly saved a camera
// the map had already left, and the pop flew back to it. The origin camera is read from
// ViewportBoundsService (or the arbiter's in-flight target) at push commit instead. Only the
// PADDING derivation, a pure layout function with no camera-source problem, remains.

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
