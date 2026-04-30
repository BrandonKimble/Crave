import React from 'react';

import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import type { useSearchResultsPanelRetainedResultsRuntime } from './use-search-results-panel-retained-results-runtime';
import type { SearchRootSearchSceneListHydrationPatch } from './use-search-root-search-scene-list-hydration-patch-runtime';
import { useSearchRootSearchSceneListFirstPaintKeyPatchRuntime } from './use-search-root-search-scene-list-first-paint-key-patch-runtime';
import { useSearchRootSearchSceneListFirstPaintReadinessPatchRuntime } from './use-search-root-search-scene-list-first-paint-readiness-patch-runtime';

export const useSearchRootSearchSceneListFirstPaintPatchRuntime = ({
  resolvedResultsRuntime,
  hydrationKeyRuntime,
}: {
  resolvedResultsRuntime: ReturnType<
    typeof useSearchResultsPanelRetainedResultsRuntime
  >;
  hydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
}): Pick<
  SearchRootSearchSceneListHydrationPatch,
  'resultsFirstPaintKey' | 'listFirstPaintReady'
> => {
  const resultsFirstPaintKey =
    useSearchRootSearchSceneListFirstPaintKeyPatchRuntime({
      resolvedResultsRuntime,
      hydrationKeyRuntime,
    });
  const listFirstPaintReady =
    useSearchRootSearchSceneListFirstPaintReadinessPatchRuntime({
      resultsFirstPaintKey,
    });

  return React.useMemo(
    () => ({
      resultsFirstPaintKey,
      listFirstPaintReady,
    }),
    [listFirstPaintReady, resultsFirstPaintKey]
  );
};
