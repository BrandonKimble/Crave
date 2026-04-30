import type { SearchRootStateFoundationLane } from '../shared/use-search-root-foundation-runtime';

export const createSearchRootStateFoundationRuntimeValue = ({
  rootPrimitivesRuntime,
  sessionPrimitivesLane,
  rootDataPlaneRuntime,
  rootSuggestionRuntime,
}: SearchRootStateFoundationLane): SearchRootStateFoundationLane => ({
  rootPrimitivesRuntime,
  sessionPrimitivesLane,
  rootDataPlaneRuntime,
  rootSuggestionRuntime,
});
