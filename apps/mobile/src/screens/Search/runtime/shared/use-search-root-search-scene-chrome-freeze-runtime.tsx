import React from 'react';

import { createSearchRootSearchSceneChromeFreezeRuntime } from '../controller/search-root-search-scene-chrome-freeze-runtime';
import { resolveShortcutToggleDisplayQuery } from './shortcut-toggle-display-query';
import type { useSearchRootSearchSceneFiltersHeaderRuntime } from './use-search-root-search-scene-filters-header-runtime';
import type { useSearchRootSearchSceneHeaderLayoutRuntime } from './use-search-root-search-scene-header-layout-runtime';
import type { useSearchResultsPanelResultsRuntimeState } from './use-search-results-panel-results-runtime-state';

type UseSearchRootSearchSceneChromeFreezeRuntimeArgs = {
  searchResultsRuntimeState: ReturnType<typeof useSearchResultsPanelResultsRuntimeState>;
  filtersHeaderRuntime: ReturnType<typeof useSearchRootSearchSceneFiltersHeaderRuntime>;
  effectiveFiltersHeaderHeight: ReturnType<
    typeof useSearchRootSearchSceneHeaderLayoutRuntime
  >['effectiveFiltersHeaderHeight'];
};

export const useSearchRootSearchSceneChromeFreezeRuntime = ({
  searchResultsRuntimeState,
  filtersHeaderRuntime,
  effectiveFiltersHeaderHeight,
}: UseSearchRootSearchSceneChromeFreezeRuntimeArgs) => {
  const searchSceneChromeFreezeRuntimeRef = React.useRef<ReturnType<
    typeof createSearchRootSearchSceneChromeFreezeRuntime
  > | null>(null);

  if (searchSceneChromeFreezeRuntimeRef.current == null) {
    searchSceneChromeFreezeRuntimeRef.current = createSearchRootSearchSceneChromeFreezeRuntime();
  }

  const freezeRuntimeValue = searchSceneChromeFreezeRuntimeRef.current.resolve({
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
  });

  return React.useMemo(
    () => ({
      effectiveFiltersHeaderHeightBase: freezeRuntimeValue.effectiveFiltersHeaderHeightBase,
      filtersHeaderRuntimeForReadModel: freezeRuntimeValue.filtersHeaderRuntimeForReadModel,
      submittedQueryForReadModel: freezeRuntimeValue.submittedQueryForReadModel,
    }),
    [
      freezeRuntimeValue.effectiveFiltersHeaderHeightBase,
      freezeRuntimeValue.filtersHeaderRuntimeForReadModel,
      freezeRuntimeValue.submittedQueryForReadModel,
    ]
  );
};
