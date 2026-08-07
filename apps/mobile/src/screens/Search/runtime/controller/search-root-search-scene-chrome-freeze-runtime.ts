import type { useSearchRootSearchSceneFiltersHeaderRuntime } from '../shared/use-search-root-search-scene-filters-header-runtime';

type SearchRootSearchSceneChromeFreezeInput = {
  filtersHeaderRuntime: ReturnType<typeof useSearchRootSearchSceneFiltersHeaderRuntime>;
  submittedQuery: string;
  effectiveFiltersHeaderHeight: number;
};

// F1735/F6411: the freeze could never engage — its gate (`shouldFreezeResultsChrome`) was
// pinned false by the fossil redraw coordinator, so every output always took the live
// branch. The gate, the frozen-snapshot field, and the freeze branches are deleted; this
// resolver is now the pass-through the pinned value always made it.
export const createSearchRootSearchSceneChromeFreezeRuntime = () => ({
  resolve: ({
    filtersHeaderRuntime,
    submittedQuery,
    effectiveFiltersHeaderHeight,
  }: SearchRootSearchSceneChromeFreezeInput) => ({
    effectiveFiltersHeaderHeightBase: effectiveFiltersHeaderHeight,
    filtersHeaderRuntimeForReadModel: filtersHeaderRuntime,
    submittedQueryForReadModel: submittedQuery,
  }),
});
