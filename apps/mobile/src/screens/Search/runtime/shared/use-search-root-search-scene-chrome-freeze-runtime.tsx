import React from 'react';

import { createSearchRootSearchSceneChromeFreezeRuntime } from '../controller/search-root-search-scene-chrome-freeze-runtime';
import type { useSearchRootSearchSceneFiltersHeaderRuntime } from './use-search-root-search-scene-filters-header-runtime';
import type { useSearchRootSearchSceneHeaderLayoutRuntime } from './use-search-root-search-scene-header-layout-runtime';
import type { useSearchResultsPanelHydrationRuntimeState } from './use-search-results-panel-hydration-runtime-state';
import type { useSearchResultsPanelResultsRuntimeState } from './use-search-results-panel-results-runtime-state';
import type { useSearchResultsPanelRetainedResultsRuntime } from './use-search-results-panel-retained-results-runtime';

type UseSearchRootSearchSceneChromeFreezeRuntimeArgs = {
  searchResultsRuntimeState: ReturnType<
    typeof useSearchResultsPanelResultsRuntimeState
  >;
  searchHydrationRuntimeState: ReturnType<
    typeof useSearchResultsPanelHydrationRuntimeState
  >;
  resolvedResultsRuntime: ReturnType<
    typeof useSearchResultsPanelRetainedResultsRuntime
  >;
  filtersHeaderRuntime: ReturnType<
    typeof useSearchRootSearchSceneFiltersHeaderRuntime
  >;
  effectiveFiltersHeaderHeight: ReturnType<
    typeof useSearchRootSearchSceneHeaderLayoutRuntime
  >['effectiveFiltersHeaderHeight'];
  effectiveResultsHeaderHeight: ReturnType<
    typeof useSearchRootSearchSceneHeaderLayoutRuntime
  >['effectiveResultsHeaderHeight'];
};

export const useSearchRootSearchSceneChromeFreezeRuntime = ({
  searchResultsRuntimeState,
  searchHydrationRuntimeState,
  resolvedResultsRuntime,
  filtersHeaderRuntime,
  effectiveFiltersHeaderHeight,
  effectiveResultsHeaderHeight,
}: UseSearchRootSearchSceneChromeFreezeRuntimeArgs) => {
  const hasResolvedResults =
    resolvedResultsRuntime.resolvedResults != null;
  const shouldFreezeResultsChrome =
    searchHydrationRuntimeState.chromeFreezeClassification === 'recovery' &&
    searchHydrationRuntimeState.isRunOneChromeDeferred &&
    !hasResolvedResults;
  const searchSceneChromeFreezeRuntimeRef = React.useRef<
    ReturnType<typeof createSearchRootSearchSceneChromeFreezeRuntime> | null
  >(null);

  if (searchSceneChromeFreezeRuntimeRef.current == null) {
    searchSceneChromeFreezeRuntimeRef.current =
      createSearchRootSearchSceneChromeFreezeRuntime();
  }

  const freezeRuntimeValue = searchSceneChromeFreezeRuntimeRef.current.resolve({
    shouldFreezeResultsChrome,
    filtersHeaderRuntime,
    submittedQuery: searchResultsRuntimeState.submittedQuery,
    effectiveFiltersHeaderHeight,
    effectiveResultsHeaderHeight,
  });

  return React.useMemo(
    () => ({
      effectiveFiltersHeaderHeightBase:
        freezeRuntimeValue.effectiveFiltersHeaderHeightBase,
      effectiveResultsHeaderHeightForRender:
        freezeRuntimeValue.effectiveResultsHeaderHeightForRender,
      filtersHeaderRuntimeForReadModel:
        freezeRuntimeValue.filtersHeaderRuntimeForReadModel,
      submittedQueryForReadModel:
        freezeRuntimeValue.submittedQueryForReadModel,
    }),
    [
      freezeRuntimeValue.effectiveFiltersHeaderHeightBase,
      freezeRuntimeValue.effectiveResultsHeaderHeightForRender,
      freezeRuntimeValue.filtersHeaderRuntimeForReadModel,
      freezeRuntimeValue.submittedQueryForReadModel,
    ]
  );
};
