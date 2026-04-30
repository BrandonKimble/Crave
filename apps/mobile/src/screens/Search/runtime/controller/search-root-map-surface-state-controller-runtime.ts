import type { SearchRootStateFoundationLane } from '../shared/use-search-root-foundation-runtime';
import type { SearchRootMapViewportIntentRuntime } from '../shared/search-root-map-viewport-intent-runtime-contract';

export type SearchRootMapSurfaceState = {
  restaurantOnlyId: SearchRootMapViewportIntentRuntime['restaurantOnlyId'];
  mapRef: SearchRootStateFoundationLane['rootPrimitivesRuntime']['mapState']['mapRef'];
  cameraRef: SearchRootStateFoundationLane['rootPrimitivesRuntime']['mapState']['cameraRef'];
  mapCenter: SearchRootMapViewportIntentRuntime['mapCenter'];
  mapZoom: SearchRootMapViewportIntentRuntime['mapZoom'];
  mapCameraAnimation: SearchRootMapViewportIntentRuntime['mapCameraAnimation'];
  isFollowingUser: SearchRootMapViewportIntentRuntime['isFollowingUser'];
};

export const createSearchRootMapSurfaceState = ({
  stateFoundationLane,
  mapViewportIntentRuntime,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
  mapViewportIntentRuntime: SearchRootMapViewportIntentRuntime;
}): SearchRootMapSurfaceState => ({
  restaurantOnlyId: mapViewportIntentRuntime.restaurantOnlyId,
  mapRef: stateFoundationLane.rootPrimitivesRuntime.mapState.mapRef,
  cameraRef: stateFoundationLane.rootPrimitivesRuntime.mapState.cameraRef,
  mapCenter: mapViewportIntentRuntime.mapCenter,
  mapZoom: mapViewportIntentRuntime.mapZoom,
  mapCameraAnimation: mapViewportIntentRuntime.mapCameraAnimation,
  isFollowingUser: mapViewportIntentRuntime.isFollowingUser,
});
