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
        filtersHeaderRuntimeForReadModel: shouldFreezeResultsChrome
          ? {
              ...frozenSnapshot.filtersHeaderRuntime,
              // Toggle ACTIVE STATES flow LIVE (straight from the runtime bus) so a
              // toggle's color flips on press-up even while the rest of the chrome
              // (header heights, chip structure, handlers) stays frozen for layout
              // stability during interaction loading. Freezing these was the regression
              // that made toggles look stuck — same color, never switching on tap.
              activeTab: filtersHeaderRuntime.activeTab,
              openNow: filtersHeaderRuntime.openNow,
              includeSimilarActive: filtersHeaderRuntime.includeSimilarActive,
              similarAvailableCount: filtersHeaderRuntime.similarAvailableCount,
              risingActive: filtersHeaderRuntime.risingActive,
              priceButtonActive: filtersHeaderRuntime.priceButtonActive,
              priceButtonLabel: filtersHeaderRuntime.priceButtonLabel,
              isPriceSelectorVisible: filtersHeaderRuntime.isPriceSelectorVisible,
            }
          : filtersHeaderRuntime,
        submittedQueryForReadModel: shouldFreezeResultsChrome
          ? frozenSnapshot.submittedQuery
          : submittedQuery,
      };
    },
  };
};
