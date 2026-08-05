import type {
  SearchMapRenderEngineInputs,
  SearchMapRenderHostConfig,
  SearchMapRenderPresentationProps,
} from '../../components/SearchMapWithMarkerEngine';
import type { SearchMapRenderEngineSnapshot } from './search-map-render-engine-snapshot-contract';

export type SearchMapRenderHostLayerRuntime = {
  isInitialCameraReady: boolean;
  markerEngineRef: SearchMapRenderEngineSnapshot['markerEngineRef'];
  engineInputs: SearchMapRenderEngineInputs;
  hostConfig: SearchMapRenderHostConfig;
  presentationProps: SearchMapRenderPresentationProps;
};
