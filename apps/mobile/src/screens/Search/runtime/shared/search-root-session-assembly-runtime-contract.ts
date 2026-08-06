import type {
  SearchRootSessionControlServicesRuntime,
  SearchRuntimePrimitivesRuntime,
} from './search-root-session-runtime-contract';

export type SearchRootSessionAssemblyRuntime = {
  interactionPrimitivesRuntime: SearchRuntimePrimitivesRuntime;
  sessionControlServices: SearchRootSessionControlServicesRuntime;
};
