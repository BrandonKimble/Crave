import React from 'react';

import { createSearchRootSearchSceneChromeFreezeRuntime } from '../controller/search-root-search-scene-chrome-freeze-runtime';
import { resolveShortcutToggleDisplayQuery } from './shortcut-toggle-display-query';
import type { useSearchRootSearchSceneFiltersHeaderRuntime } from './use-search-root-search-scene-filters-header-runtime';
import type { useSearchRootSearchSceneHeaderLayoutRuntime } from './use-search-root-search-scene-header-layout-runtime';
import type { useSearchResultsPanelHydrationRuntimeState } from './use-search-results-panel-hydration-runtime-state';
import type { useSearchResultsPanelResultsRuntimeState } from './use-search-results-panel-results-runtime-state';
import type { useSearchResultsPanelRetainedResultsRuntime } from './use-search-results-panel-retained-results-runtime';

type UseSearchRootSearchSceneChromeFreezeRuntimeArgs = {
  searchResultsRuntimeState: ReturnType<typeof useSearchResultsPanelResultsRuntimeState>;
  searchHydrationRuntimeState: ReturnType<typeof useSearchResultsPanelHydrationRuntimeState>;
  resolvedResultsRuntime: ReturnType<typeof useSearchResultsPanelRetainedResultsRuntime>;
  filtersHeaderRuntime: ReturnType<typeof useSearchRootSearchSceneFiltersHeaderRuntime>;
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
  const hasResolvedResults = resolvedResultsRuntime.resolvedResults != null;
  const shouldFreezeResultsChrome =
    searchHydrationRuntimeState.chromeFreezeClassification === 'recovery' &&
    searchHydrationRuntimeState.isSearchSurfaceRedrawChromeDeferred &&
    !hasResolvedResults;
  const searchSceneChromeFreezeRuntimeRef = React.useRef<ReturnType<
    typeof createSearchRootSearchSceneChromeFreezeRuntime
  > | null>(null);

  if (searchSceneChromeFreezeRuntimeRef.current == null) {
    searchSceneChromeFreezeRuntimeRef.current = createSearchRootSearchSceneChromeFreezeRuntime();
  }

  const freezeRuntimeValue = searchSceneChromeFreezeRuntimeRef.current.resolve({
    shouldFreezeResultsChrome,
    filtersHeaderRuntime,
    // Shortcut toggle title swap: a shortcut search toggled to the sibling tab shows the sibling
    // shortcut's label ("Best restaurants" ⇄ "Best dishes"), swapped optimistically on press-up
    // via the desired tab (tuple.tab). Display-only.
    submittedQuery: resolveShortcutToggleDisplayQuery({
      displayQuery: searchResultsRuntimeState.submittedQuery,
      searchMode: searchResultsRuntimeState.searchMode,
      optimisticActiveTab: searchResultsRuntimeState.desiredTab,
    }),
    effectiveFiltersHeaderHeight,
    effectiveResultsHeaderHeight,
  });

  return React.useMemo(
    () => ({
      effectiveFiltersHeaderHeightBase: freezeRuntimeValue.effectiveFiltersHeaderHeightBase,
      effectiveResultsHeaderHeightForRender:
        freezeRuntimeValue.effectiveResultsHeaderHeightForRender,
      filtersHeaderRuntimeForReadModel: freezeRuntimeValue.filtersHeaderRuntimeForReadModel,
      submittedQueryForReadModel: freezeRuntimeValue.submittedQueryForReadModel,
    }),
    [
      freezeRuntimeValue.effectiveFiltersHeaderHeightBase,
      freezeRuntimeValue.effectiveResultsHeaderHeightForRender,
      freezeRuntimeValue.filtersHeaderRuntimeForReadModel,
      freezeRuntimeValue.submittedQueryForReadModel,
    ]
  );
};
