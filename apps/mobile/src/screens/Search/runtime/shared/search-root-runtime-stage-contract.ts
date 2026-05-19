import type { ProfilerOnRenderCallback } from 'react';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import type {
  SearchMapRenderHostAuthority,
} from './search-root-host-authority-contract';

export type SearchRootRuntimeStageRuntime = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
  mapRenderHostAuthority: SearchMapRenderHostAuthority;
  onProfilerRender: ProfilerOnRenderCallback | null;
};
