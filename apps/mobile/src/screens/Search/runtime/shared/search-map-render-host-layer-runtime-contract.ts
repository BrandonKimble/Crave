import type {
  SearchMapRenderEngineInputs,
  SearchMapRenderHostConfig,
  SearchMapRenderPresentationProps,
} from '../../components/SearchMapWithMarkerEngine';
import type { SearchMapRenderEngineSnapshot } from './search-map-render-engine-snapshot-contract';
import type { ProfilerOnRenderCallback } from 'react';

export type SearchMapRenderHostLayerRuntime = {
  isInitialCameraReady: boolean;
  onProfilerRender: ProfilerOnRenderCallback;
  markerEngineRef: SearchMapRenderEngineSnapshot['markerEngineRef'];
  engineInputs: SearchMapRenderEngineInputs;
  hostConfig: SearchMapRenderHostConfig;
  presentationProps: SearchMapRenderPresentationProps;
};
