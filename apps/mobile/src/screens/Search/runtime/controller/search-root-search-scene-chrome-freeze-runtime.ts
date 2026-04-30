import type { useSearchRootSearchSceneFiltersHeaderRuntime } from '../shared/use-search-root-search-scene-filters-header-runtime';

type SearchRootSearchSceneChromeFreezeSnapshot = {
  filtersHeaderRuntime: ReturnType<
    typeof useSearchRootSearchSceneFiltersHeaderRuntime
  >;
  submittedQuery: string;
  effectiveFiltersHeaderHeight: number;
  effectiveResultsHeaderHeight: number;
};

type SearchRootSearchSceneChromeFreezeInput = {
  shouldFreezeResultsChrome: boolean;
  filtersHeaderRuntime: SearchRootSearchSceneChromeFreezeSnapshot['filtersHeaderRuntime'];
  submittedQuery: string;
  effectiveFiltersHeaderHeight: number;
  effectiveResultsHeaderHeight: number;
};

export const createSearchRootSearchSceneChromeFreezeRuntime = () => {
  let frozenResultsChromeSnapshot: SearchRootSearchSceneChromeFreezeSnapshot | null =
    null;

  return {
    resolve: ({
      shouldFreezeResultsChrome,
      filtersHeaderRuntime,
      submittedQuery,
      effectiveFiltersHeaderHeight,
      effectiveResultsHeaderHeight,
    }: SearchRootSearchSceneChromeFreezeInput) => {
      if (!shouldFreezeResultsChrome || !frozenResultsChromeSnapshot) {
        frozenResultsChromeSnapshot = {
          filtersHeaderRuntime,
          submittedQuery,
          effectiveFiltersHeaderHeight,
          effectiveResultsHeaderHeight,
        };
      }

      return {
        effectiveFiltersHeaderHeightBase: shouldFreezeResultsChrome
          ? frozenResultsChromeSnapshot?.effectiveFiltersHeaderHeight ??
            effectiveFiltersHeaderHeight
          : effectiveFiltersHeaderHeight,
        effectiveResultsHeaderHeightForRender: shouldFreezeResultsChrome
          ? frozenResultsChromeSnapshot?.effectiveResultsHeaderHeight ??
            effectiveResultsHeaderHeight
          : effectiveResultsHeaderHeight,
        filtersHeaderRuntimeForReadModel: shouldFreezeResultsChrome
          ? frozenResultsChromeSnapshot?.filtersHeaderRuntime ??
            filtersHeaderRuntime
          : filtersHeaderRuntime,
        submittedQueryForReadModel: shouldFreezeResultsChrome
          ? frozenResultsChromeSnapshot?.submittedQuery ?? submittedQuery
          : submittedQuery,
      };
    },
  };
};
