import type { SearchRootPrimitivesRuntime } from '../shared/search-root-primitives-runtime-contract';

export const createSearchRootPrimitivesRuntimeValue = ({
  mapState,
  searchState,
}: SearchRootPrimitivesRuntime): SearchRootPrimitivesRuntime => ({
  mapState,
  searchState,
});
