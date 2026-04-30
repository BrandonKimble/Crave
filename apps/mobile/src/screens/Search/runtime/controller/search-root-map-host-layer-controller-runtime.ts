import type { SearchMapRenderEngineInputs, SearchMapRenderHostConfig, SearchMapRenderPresentationProps } from '../../components/SearchMapWithMarkerEngine';
import type { SearchMapRenderHostLayerRuntime } from '../shared/search-map-render-host-layer-runtime-contract';
import type { SearchRootStateFoundationLane } from '../shared/use-search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from '../shared/use-search-root-session-runtime-contract';
import type { createSearchRootMapPresentationRuntimeValue } from './search-root-map-presentation-controller-runtime';

export const createSearchRootMapHostLayerRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  mapPresentationRuntime,
  engineInputs,
  hostConfig,
  presentationProps,
}: {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  mapPresentationRuntime: ReturnType<
    typeof createSearchRootMapPresentationRuntimeValue
  >;
  engineInputs: SearchMapRenderEngineInputs;
  hostConfig: SearchMapRenderHostConfig;
  presentationProps: SearchMapRenderPresentationProps;
}): SearchMapRenderHostLayerRuntime => ({
  isInitialCameraReady: sessionCoreLane.mapBootstrapRuntime.isInitialCameraReady,
  onProfilerRender: mapPresentationRuntime.onProfilerRender,
  markerEngineRef: stateFoundationLane.rootPrimitivesRuntime.mapState.markerEngineRef,
  engineInputs,
  hostConfig,
  presentationProps,
});
