import type {
  SearchRootSessionControlServicesRuntime,
  SearchRuntimePrimitivesRuntime,
} from './search-root-session-runtime-contract';

export type SearchRootSessionServicesFoundationRuntime = {
  interactionPrimitivesRuntime: SearchRuntimePrimitivesRuntime;
  sessionControlServices: SearchRootSessionControlServicesRuntime;
};
