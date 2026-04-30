import type {
  SearchRootSessionControlServicesRuntime,
  SearchRuntimePrimitivesRuntime,
} from './use-search-root-session-runtime-contract';

export type SearchRootSessionAssemblyRuntime = {
  interactionPrimitivesRuntime: SearchRuntimePrimitivesRuntime;
  sessionControlServices: SearchRootSessionControlServicesRuntime;
};
