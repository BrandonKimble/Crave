import React from 'react';

import type { SearchMapRenderHostConfig } from '../../components/SearchMapWithMarkerEngine';
import {
  createSearchRootMapEngineInputs,
} from '../controller/search-root-map-engine-input-controller-runtime';
import {
  createSearchRootMapHostConfig,
} from '../controller/search-root-map-host-config-controller-runtime';
import {
  createSearchRootMapPresentationProps,
} from '../controller/search-root-map-presentation-props-controller-runtime';
import type { useSearchRootMapPresentationRuntime } from './use-search-root-map-presentation-runtime';
import type { SearchRootMapSurfaceStateRuntimeValue } from './use-search-root-map-surface-state-runtime';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';

type UseSearchRootMapSurfaceViewRuntimeArgs = {
  appEntryPlaneRuntime: Pick<
    ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>,
    'startupLocationSnapshot' | 'userLocation'
  >;
  mapPresentationRuntime: ReturnType<typeof useSearchRootMapPresentationRuntime>;
  mapInteractionBridgeRuntime: {
    onMapPress: SearchMapRenderHostConfig['onPress'];
    onNativeViewportChanged: SearchMapRenderHostConfig['onNativeViewportChanged'];
    onMapIdle: SearchMapRenderHostConfig['onMapIdle'];
    onMapTouchStart: NonNullable<SearchMapRenderHostConfig['onTouchStart']>;
    onMapTouchEnd: NonNullable<SearchMapRenderHostConfig['onTouchEnd']>;
    onMapLoaded: SearchMapRenderHostConfig['onMapLoaded'];
  };
  mapSurfaceStateRuntime: SearchRootMapSurfaceStateRuntimeValue;
};

export const useSearchRootMapSurfaceViewRuntime = ({
  appEntryPlaneRuntime,
  mapPresentationRuntime,
  mapInteractionBridgeRuntime,
  mapSurfaceStateRuntime,
}: UseSearchRootMapSurfaceViewRuntimeArgs) => {
  const engineInputs = React.useMemo(
    () =>
      createSearchRootMapEngineInputs({
        mapSurfaceState: mapSurfaceStateRuntime.mapSurfaceState,
        mapPresentationRuntime,
      }),
    [
      mapPresentationRuntime.getPerfNow,
      mapPresentationRuntime.highlightedRestaurantId,
      mapPresentationRuntime.logSearchCompute,
      mapPresentationRuntime.mapGestureActiveRef,
      mapPresentationRuntime.mapMotionPressureController,
      mapPresentationRuntime.mapQueryBudget,
      mapPresentationRuntime.pickPreferredRestaurantMapLocation,
      mapPresentationRuntime.profileCommandPort,
      mapPresentationRuntime.resolveRestaurantLocationSelectionAnchor,
      mapPresentationRuntime.resolveRestaurantMapLocations,
      mapPresentationRuntime.shouldLogSearchComputes,
      mapPresentationRuntime.viewportBoundsService,
      mapSurfaceStateRuntime.mapSurfaceState.restaurantOnlyId,
    ]
  );

  const hostConfig = React.useMemo(
    () =>
      createSearchRootMapHostConfig({
        mapSurfaceState: mapSurfaceStateRuntime.mapSurfaceState,
        styleURL: mapSurfaceStateRuntime.styleURL,
        mapInteractionBridgeRuntime,
        mapPresentationRuntime,
        presentationLifecyclePort:
          mapSurfaceStateRuntime.presentationLifecyclePort,
      }),
    [
      mapInteractionBridgeRuntime,
      mapPresentationRuntime.handleMainMapFullyRendered,
      mapPresentationRuntime.onProfilerRender,
      mapSurfaceStateRuntime.mapSurfaceState.cameraRef,
      mapSurfaceStateRuntime.mapSurfaceState.mapRef,
      mapSurfaceStateRuntime.presentationLifecyclePort,
      mapSurfaceStateRuntime.styleURL,
    ]
  );

  const presentationProps = React.useMemo(
    () =>
      createSearchRootMapPresentationProps({
        mapSurfaceState: mapSurfaceStateRuntime.mapSurfaceState,
        mapPresentationRuntime,
        startupLocationSnapshot:
          appEntryPlaneRuntime.startupLocationSnapshot,
        userLocation: appEntryPlaneRuntime.userLocation,
      }),
    [
      appEntryPlaneRuntime.startupLocationSnapshot,
      appEntryPlaneRuntime.userLocation,
      mapPresentationRuntime.cameraPadding,
      mapPresentationRuntime.isMapStyleReady,
      mapSurfaceStateRuntime.mapSurfaceState.isFollowingUser,
      mapSurfaceStateRuntime.mapSurfaceState.mapCameraAnimation,
      mapSurfaceStateRuntime.mapSurfaceState.mapCenter,
      mapSurfaceStateRuntime.mapSurfaceState.mapZoom,
    ]
  );

  return React.useMemo(
    () => ({
      engineInputs,
      hostConfig,
      presentationProps,
    }),
    [engineInputs, hostConfig, presentationProps]
  );
};
