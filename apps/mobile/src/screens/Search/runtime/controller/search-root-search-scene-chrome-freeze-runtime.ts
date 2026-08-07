import type { useSearchRootSearchSceneFiltersHeaderRuntime } from '../shared/use-search-root-search-scene-filters-header-runtime';

type SearchRootSearchSceneChromeFreezeSnapshot = {
  filtersHeaderRuntime: ReturnType<typeof useSearchRootSearchSceneFiltersHeaderRuntime>;
  submittedQuery: string;
  effectiveFiltersHeaderHeight: number;
};

type SearchRootSearchSceneChromeFreezeInput = {
  shouldFreezeResultsChrome: boolean;
  filtersHeaderRuntime: SearchRootSearchSceneChromeFreezeSnapshot['filtersHeaderRuntime'];
  submittedQuery: string;
  effectiveFiltersHeaderHeight: number;
};

export const createSearchRootSearchSceneChromeFreezeRuntime = () => {
  let frozenResultsChromeSnapshot: SearchRootSearchSceneChromeFreezeSnapshot | null = null;

  return {
    resolve: ({
      shouldFreezeResultsChrome,
      filtersHeaderRuntime,
      submittedQuery,
      effectiveFiltersHeaderHeight,
    }: SearchRootSearchSceneChromeFreezeInput) => {
      if (!shouldFreezeResultsChrome || !frozenResultsChromeSnapshot) {
        frozenResultsChromeSnapshot = {
          filtersHeaderRuntime,
          submittedQuery,
          effectiveFiltersHeaderHeight,
        };
      }
      // F1612(b): the guard above assigns `frozenResultsChromeSnapshot` whenever it was
      // null, so by this point it is non-null on EVERY path — read it into a local instead
      // of three `?.` / `??` fallbacks that can never take their right-hand side (proven by
      // the control-flow trace: the only way to reach here with a null snapshot is the
      // branch that just assigned it).
      const frozenSnapshot = frozenResultsChromeSnapshot;

      return {
        effectiveFiltersHeaderHeightBase: shouldFreezeResultsChrome
          ? frozenSnapshot.effectiveFiltersHeaderHeight
          : effectiveFiltersHeaderHeight,
        // F3900/D78: this used to spread the FROZEN header and then punch eight toggle
        // ACTIVE STATES back through it live, so a chip's color could flip on press-up
        // while the rest of the chrome stayed frozen for layout stability. That hole is
        // no longer needed and no longer possible: the strip reads those states straight
        // from the runtime bus (`selectSearchFilterChipState`), which the freeze never
        // touched — the props the hole re-supplied are deleted. What freezes here is what
        // freezing was always for: header heights, chip structure, handlers.
        filtersHeaderRuntimeForReadModel: shouldFreezeResultsChrome
          ? frozenSnapshot.filtersHeaderRuntime
          : filtersHeaderRuntime,
        submittedQueryForReadModel: shouldFreezeResultsChrome
          ? frozenSnapshot.submittedQuery
          : submittedQuery,
      };
    },
  };
};
