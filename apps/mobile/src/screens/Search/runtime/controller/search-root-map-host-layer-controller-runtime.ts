import type {
  SearchMapRenderEngineInputs,
  SearchMapRenderHostConfig,
  SearchMapRenderPresentationProps,
} from '../../components/SearchMapWithMarkerEngine';
import type { SearchMapRenderHostLayerRuntime } from '../shared/search-map-render-host-layer-runtime-contract';
import type { SearchRootStateFoundationLane } from '../shared/use-search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from '../shared/use-search-root-session-runtime-contract';

// F1618: `onProfilerRender` used to be threaded here AND into `hostConfig` — the same
// callback plumbed twice into the same composite for zero benefit (SearchMapWithMarkerEngine
// only ever reads it off the host-config key set). `SearchMapRenderHostLayers` used it
// directly too, so the field wasn't dead — it now reads `hostConfig.onProfilerRender`
// instead, so `hostConfig` stays the field's one owner.
export const createSearchRootMapHostLayerRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  engineInputs,
  hostConfig,
  presentationProps,
}: {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  engineInputs: SearchMapRenderEngineInputs;
  hostConfig: SearchMapRenderHostConfig;
  presentationProps: SearchMapRenderPresentationProps;
}): SearchMapRenderHostLayerRuntime => ({
  isInitialCameraReady: sessionCoreLane.mapBootstrapRuntime.isInitialCameraReady,
  markerEngineRef: stateFoundationLane.rootPrimitivesRuntime.mapState.markerEngineRef,
  engineInputs,
  hostConfig,
  presentationProps,
});
