import type {
  SearchMapRenderPresentationProps,
} from '../../components/SearchMapWithMarkerEngine';
import { USA_FALLBACK_ZOOM } from '../../constants/search';
import type { SearchRootMapPresentationEnvironment } from '../shared/search-root-environment-contract';
import type { createSearchRootMapPresentationRuntimeValue } from './search-root-map-presentation-controller-runtime';
import type { SearchRootMapSurfaceState } from './search-root-map-surface-state-controller-runtime';

export const getSearchMapPresentationPropChanges = (
  left: SearchMapRenderPresentationProps,
  right: SearchMapRenderPresentationProps
): Record<string, boolean> => ({
  cameraPadding: left.cameraPadding !== right.cameraPadding,
  mapCenter: left.mapCenter !== right.mapCenter,
  mapZoom: left.mapZoom !== right.mapZoom,
  mapBearing: left.mapBearing !== right.mapBearing,
  mapPitch: left.mapPitch !== right.mapPitch,
  mapCameraAnimation: left.mapCameraAnimation !== right.mapCameraAnimation,
  isFollowingUser: left.isFollowingUser !== right.isFollowingUser,
  isMapStyleReady: left.isMapStyleReady !== right.isMapStyleReady,
  userLocation: left.userLocation !== right.userLocation,
  userLocationSnapshot: left.userLocationSnapshot !== right.userLocationSnapshot,
  disableMarkers: left.disableMarkers !== right.disableMarkers,
  disableBlur: left.disableBlur !== right.disableBlur,
});

export const createSearchRootMapPresentationProps = ({
  mapSurfaceState,
  mapPresentationRuntime,
  startupLocationSnapshot,
  userLocation,
}: {
  mapSurfaceState: SearchRootMapSurfaceState;
  mapPresentationRuntime: ReturnType<
    typeof createSearchRootMapPresentationRuntimeValue
  >;
  startupLocationSnapshot: SearchRootMapPresentationEnvironment['startupLocationSnapshot'];
  userLocation: SearchRootMapPresentationEnvironment['userLocation'];
}): SearchMapRenderPresentationProps => ({
  mapCenter: mapSurfaceState.mapCenter,
  mapZoom: mapSurfaceState.mapZoom ?? USA_FALLBACK_ZOOM,
  mapBearing: mapSurfaceState.mapBearing,
  mapPitch: mapSurfaceState.mapPitch,
  mapCameraAnimation: mapSurfaceState.mapCameraAnimation,
  cameraPadding: mapPresentationRuntime.cameraPadding,
  isFollowingUser: mapSurfaceState.isFollowingUser,
  isMapStyleReady: mapPresentationRuntime.isMapStyleReady,
  userLocation,
  userLocationSnapshot: startupLocationSnapshot,
  disableMarkers: false,
  disableBlur: false,
});
