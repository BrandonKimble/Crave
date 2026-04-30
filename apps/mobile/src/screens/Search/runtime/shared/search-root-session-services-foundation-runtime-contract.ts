import type {
  SearchRootSessionControlServicesRuntime,
  SearchRuntimePrimitivesRuntime,
} from './use-search-root-session-runtime-contract';

export type SearchRootSessionServicesFoundationRuntime = {
  interactionPrimitivesRuntime: SearchRuntimePrimitivesRuntime;
  sessionControlServices: SearchRootSessionControlServicesRuntime;
};
