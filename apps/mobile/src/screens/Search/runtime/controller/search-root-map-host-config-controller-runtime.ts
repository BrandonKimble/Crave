import type { SearchMapRenderHostConfig } from '../../components/SearchMapWithMarkerEngine';
import type { SearchMapPresentationLifecyclePort } from '../shared/search-map-protocol-contract';
import type { createSearchRootMapPresentationRuntimeValue } from './search-root-map-presentation-controller-runtime';
import type { SearchRootMapSurfaceState } from './search-root-map-surface-state-controller-runtime';

export const getSearchMapHostConfigChanges = (
  left: SearchMapRenderHostConfig,
  right: SearchMapRenderHostConfig
): Record<string, boolean> => ({
  mapRef: left.mapRef !== right.mapRef,
  cameraRef: left.cameraRef !== right.cameraRef,
  styleURL: left.styleURL !== right.styleURL,
  onPress: left.onPress !== right.onPress,
  onTouchStart: left.onTouchStart !== right.onTouchStart,
  onTouchEnd: left.onTouchEnd !== right.onTouchEnd,
  onNativeViewportChanged: left.onNativeViewportChanged !== right.onNativeViewportChanged,
  onMapIdle: left.onMapIdle !== right.onMapIdle,
  onMapLoaded: left.onMapLoaded !== right.onMapLoaded,
  onMapFullyRendered: left.onMapFullyRendered !== right.onMapFullyRendered,
  onCameraAnimationComplete: left.onCameraAnimationComplete !== right.onCameraAnimationComplete,
  presentationLifecyclePort: left.presentationLifecyclePort !== right.presentationLifecyclePort,
  searchMapProfilerRender: left.onProfilerRender !== right.onProfilerRender,
});

export const createSearchRootMapHostConfig = ({
  mapSurfaceState,
  styleURL,
  mapInteractionBridgeRuntime,
  mapPresentationRuntime,
  presentationLifecyclePort,
}: {
  mapSurfaceState: SearchRootMapSurfaceState;
  styleURL: string;
  mapInteractionBridgeRuntime: {
    onMapPress: SearchMapRenderHostConfig['onPress'];
    onNativeViewportChanged: SearchMapRenderHostConfig['onNativeViewportChanged'];
    onMapIdle: SearchMapRenderHostConfig['onMapIdle'];
    onMapTouchStart: NonNullable<SearchMapRenderHostConfig['onTouchStart']>;
    onMapTouchEnd: NonNullable<SearchMapRenderHostConfig['onTouchEnd']>;
    onMapLoaded: SearchMapRenderHostConfig['onMapLoaded'];
  };
  mapPresentationRuntime: ReturnType<typeof createSearchRootMapPresentationRuntimeValue>;
  presentationLifecyclePort: SearchMapPresentationLifecyclePort;
}): SearchMapRenderHostConfig => ({
  mapRef: mapSurfaceState.mapRef,
  cameraRef: mapSurfaceState.cameraRef,
  styleURL,
  onPress: mapInteractionBridgeRuntime.onMapPress,
  onTouchStart: mapInteractionBridgeRuntime.onMapTouchStart,
  onTouchEnd: mapInteractionBridgeRuntime.onMapTouchEnd,
  onNativeViewportChanged: mapInteractionBridgeRuntime.onNativeViewportChanged,
  onMapIdle: mapInteractionBridgeRuntime.onMapIdle,
  onMapLoaded: mapInteractionBridgeRuntime.onMapLoaded,
  onMapFullyRendered: mapPresentationRuntime.handleMainMapFullyRendered,
  onCameraAnimationComplete: mapPresentationRuntime.handleCameraAnimationComplete,
  presentationLifecyclePort,
  onProfilerRender: mapPresentationRuntime.onProfilerRender,
});
