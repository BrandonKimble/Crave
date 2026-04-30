import type { ProfilerOnRenderCallback } from 'react';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type {
  SearchMapRenderHostAuthority,
} from './search-root-host-authority-contract';

export type SearchRootRuntimeStageRuntime = {
  searchRuntimeBus: SearchRuntimeBus;
  mapRenderHostAuthority: SearchMapRenderHostAuthority;
  onProfilerRender: ProfilerOnRenderCallback;
};
