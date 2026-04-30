import type { SearchRootSuggestionRuntime } from './search-root-core-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type {
  SearchRootDataPlaneRuntime,
  SearchRootSessionPrimitivesLane,
} from './use-search-root-session-runtime-contract';

export type SearchRootStateFoundationLane = {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  sessionPrimitivesLane: SearchRootSessionPrimitivesLane;
  rootDataPlaneRuntime: SearchRootDataPlaneRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
};
