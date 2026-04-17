import type { SearchRootScaffoldRuntime } from './search-root-scaffold-runtime-contract';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootRenderRuntime } from './search-root-render-runtime-contract';
import {
  type SearchRootSessionRuntime,
  type UseSearchRootSessionRuntimeArgs,
} from './use-search-root-session-runtime-contract';

export type SearchRootBootstrapRuntimeArgs = {
  isSearchScreenFocused: boolean;
  startupPollBounds: UseSearchRootSessionRuntimeArgs['startupPollBounds'];
  startupCamera: UseSearchRootSessionRuntimeArgs['startupCamera'];
  markMainMapReady: UseSearchRootSessionRuntimeArgs['markMainMapReady'];
};

export type UseSearchRootRuntimeArgs = SearchRootEnvironment & SearchRootBootstrapRuntimeArgs;

export type SearchRootRuntime = Pick<SearchRootRenderRuntime, 'mapRenderSurfaceModel'> & {
  handleProfilerRender: SearchRootScaffoldRuntime['instrumentationRuntime']['handleProfilerRender'];
  searchRuntimeBus: SearchRootSessionRuntime['runtimeOwner']['searchRuntimeBus'];
  markerEngineRef: UseSearchRootSessionRuntimeArgs['markerEngineRef'];
  isInitialCameraReady: SearchRootSessionRuntime['mapBootstrapRuntime']['isInitialCameraReady'];
};
