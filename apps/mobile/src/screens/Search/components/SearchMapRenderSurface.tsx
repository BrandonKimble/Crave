import React from 'react';
import { View } from 'react-native';

import { logger } from '../../../utils';
import SearchMapWithMarkerEngine, {
  type SearchMapMarkerEngineHandle,
} from './SearchMapWithMarkerEngine';
import type { SearchRootMapRenderSurfaceModel } from '../runtime/shared/search-root-render-runtime-contract';
import styles from '../styles';

const SHOULD_LOG_ROOT_OVERLAY_ATTRIBUTION = __DEV__;

type SearchMapRenderSurfaceProps = {
  isInitialCameraReady: boolean;
  markerEngineRef: React.RefObject<SearchMapMarkerEngineHandle | null>;
  mapRenderSurfaceModel: SearchRootMapRenderSurfaceModel;
  onProfilerRender: React.ProfilerOnRenderCallback;
};

const SearchMapRenderSurfaceInner = ({
  isInitialCameraReady,
  markerEngineRef,
  mapRenderSurfaceModel,
  onProfilerRender,
}: SearchMapRenderSurfaceProps) => {
  const { searchMapProps } = mapRenderSurfaceModel;
  const previousAttributionRef = React.useRef<{
    isInitialCameraReady: boolean;
    markerEngineRef: React.RefObject<SearchMapMarkerEngineHandle | null>;
    mapRenderSurfaceModel: SearchRootMapRenderSurfaceModel;
    searchMapProps: SearchRootMapRenderSurfaceModel['searchMapProps'];
    onProfilerRender: React.ProfilerOnRenderCallback;
  } | null>(null);

  React.useEffect(() => {
    logger.debug('[MAP-MOUNT-DIAG] SearchMapRenderSurface:cameraGate', {
      isInitialCameraReady,
    });
  }, [isInitialCameraReady]);

  React.useEffect(() => {
    if (!SHOULD_LOG_ROOT_OVERLAY_ATTRIBUTION) {
      return;
    }

    const previous = previousAttributionRef.current;
    const next = {
      isInitialCameraReady,
      markerEngineRef,
      mapRenderSurfaceModel,
      searchMapProps,
      onProfilerRender,
    };

    if (!previous) {
      previousAttributionRef.current = next;
      logger.debug('[ROOT-OVERLAY-ATTRIBUTION] mapRenderSurface:init', {
        isInitialCameraReady,
      });
      return;
    }

    const incomingChanged = {
      isInitialCameraReady: previous.isInitialCameraReady !== next.isInitialCameraReady,
      markerEngineRef: previous.markerEngineRef !== next.markerEngineRef,
      mapRenderSurfaceModel: previous.mapRenderSurfaceModel !== next.mapRenderSurfaceModel,
      searchMapProps: previous.searchMapProps !== next.searchMapProps,
      onProfilerRender: previous.onProfilerRender !== next.onProfilerRender,
    };

    const searchMapPropChanges = {
      restaurantOnlyId:
        previous.searchMapProps.restaurantOnlyId !== next.searchMapProps.restaurantOnlyId,
      highlightedRestaurantId:
        previous.searchMapProps.highlightedRestaurantId !==
        next.searchMapProps.highlightedRestaurantId,
      viewportBoundsService:
        previous.searchMapProps.viewportBoundsService !== next.searchMapProps.viewportBoundsService,
      resolveRestaurantMapLocations:
        previous.searchMapProps.resolveRestaurantMapLocations !==
        next.searchMapProps.resolveRestaurantMapLocations,
      resolveRestaurantLocationSelectionAnchor:
        previous.searchMapProps.resolveRestaurantLocationSelectionAnchor !==
        next.searchMapProps.resolveRestaurantLocationSelectionAnchor,
      pickPreferredRestaurantMapLocation:
        previous.searchMapProps.pickPreferredRestaurantMapLocation !==
        next.searchMapProps.pickPreferredRestaurantMapLocation,
      mapGestureActiveRef:
        previous.searchMapProps.mapGestureActiveRef !== next.searchMapProps.mapGestureActiveRef,
      mapMotionPressureController:
        previous.searchMapProps.mapMotionPressureController !==
        next.searchMapProps.mapMotionPressureController,
      shouldLogSearchComputes:
        previous.searchMapProps.shouldLogSearchComputes !==
        next.searchMapProps.shouldLogSearchComputes,
      getPerfNow: previous.searchMapProps.getPerfNow !== next.searchMapProps.getPerfNow,
      logSearchCompute:
        previous.searchMapProps.logSearchCompute !== next.searchMapProps.logSearchCompute,
      mapQueryBudget: previous.searchMapProps.mapQueryBudget !== next.searchMapProps.mapQueryBudget,
      cameraPadding: previous.searchMapProps.cameraPadding !== next.searchMapProps.cameraPadding,
      profileCommandPort:
        previous.searchMapProps.profileCommandPort !== next.searchMapProps.profileCommandPort,
      mapRef: previous.searchMapProps.mapRef !== next.searchMapProps.mapRef,
      cameraRef: previous.searchMapProps.cameraRef !== next.searchMapProps.cameraRef,
      styleURL: previous.searchMapProps.styleURL !== next.searchMapProps.styleURL,
      presentationLifecyclePort:
        previous.searchMapProps.presentationLifecyclePort !==
        next.searchMapProps.presentationLifecyclePort,
      mapCenter: previous.searchMapProps.mapCenter !== next.searchMapProps.mapCenter,
      mapZoom: previous.searchMapProps.mapZoom !== next.searchMapProps.mapZoom,
      mapCameraAnimation:
        previous.searchMapProps.mapCameraAnimation !== next.searchMapProps.mapCameraAnimation,
      isFollowingUser:
        previous.searchMapProps.isFollowingUser !== next.searchMapProps.isFollowingUser,
      onPress: previous.searchMapProps.onPress !== next.searchMapProps.onPress,
      onTouchStart: previous.searchMapProps.onTouchStart !== next.searchMapProps.onTouchStart,
      onTouchEnd: previous.searchMapProps.onTouchEnd !== next.searchMapProps.onTouchEnd,
      onNativeViewportChanged:
        previous.searchMapProps.onNativeViewportChanged !==
        next.searchMapProps.onNativeViewportChanged,
      onMapIdle: previous.searchMapProps.onMapIdle !== next.searchMapProps.onMapIdle,
      onMapLoaded: previous.searchMapProps.onMapLoaded !== next.searchMapProps.onMapLoaded,
      onMapFullyRendered:
        previous.searchMapProps.onMapFullyRendered !== next.searchMapProps.onMapFullyRendered,
      isMapStyleReady:
        previous.searchMapProps.isMapStyleReady !== next.searchMapProps.isMapStyleReady,
      userLocation: previous.searchMapProps.userLocation !== next.searchMapProps.userLocation,
      userLocationSnapshot:
        previous.searchMapProps.userLocationSnapshot !== next.searchMapProps.userLocationSnapshot,
      disableMarkers: previous.searchMapProps.disableMarkers !== next.searchMapProps.disableMarkers,
      disableBlur: previous.searchMapProps.disableBlur !== next.searchMapProps.disableBlur,
      searchMapProfilerRender:
        previous.searchMapProps.onProfilerRender !== next.searchMapProps.onProfilerRender,
    };

    const didIncomingChange = Object.values(incomingChanged).some(Boolean);
    const didSearchMapPropChange = Object.values(searchMapPropChanges).some(Boolean);

    if (didIncomingChange || didSearchMapPropChange) {
      logger.debug('[ROOT-OVERLAY-ATTRIBUTION] mapRenderSurface:propDiff', {
        incomingChanged,
        searchMapPropChanges,
      });
    }

    previousAttributionRef.current = next;
  }, [
    isInitialCameraReady,
    mapRenderSurfaceModel,
    markerEngineRef,
    onProfilerRender,
    searchMapProps,
  ]);

  return (
    <React.Profiler id="SearchScreen" onRender={onProfilerRender}>
      <View style={styles.container}>
        {!isInitialCameraReady ? (
          <React.Profiler id="SearchMapPlaceholder" onRender={onProfilerRender}>
            <View pointerEvents="none" style={styles.mapPlaceholder} />
          </React.Profiler>
        ) : (
          <React.Profiler id="SearchMapTree" onRender={onProfilerRender}>
            <SearchMapWithMarkerEngine ref={markerEngineRef} {...searchMapProps} />
          </React.Profiler>
        )}
      </View>
    </React.Profiler>
  );
};

export const SearchMapRenderSurface = React.memo(
  SearchMapRenderSurfaceInner,
  (previous, next) =>
    previous.isInitialCameraReady === next.isInitialCameraReady &&
    previous.markerEngineRef === next.markerEngineRef &&
    previous.mapRenderSurfaceModel === next.mapRenderSurfaceModel &&
    previous.onProfilerRender === next.onProfilerRender
);
