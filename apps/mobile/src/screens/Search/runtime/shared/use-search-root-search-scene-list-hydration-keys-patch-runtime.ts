import React from 'react';

import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import type { SearchRootSearchSceneListHydrationPatch } from './use-search-root-search-scene-list-hydration-patch-runtime';

export const useSearchRootSearchSceneListHydrationKeysPatchRuntime = ({
  hydrationKeyRuntime,
}: {
  hydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
}): Pick<SearchRootSearchSceneListHydrationPatch, 'resultsHydrationKey' | 'hydratedResultsKey'> =>
  React.useMemo(
    () => ({
      resultsHydrationKey: hydrationKeyRuntime.resultsHydrationKey,
      hydratedResultsKey: hydrationKeyRuntime.hydratedResultsKey,
    }),
    [hydrationKeyRuntime.hydratedResultsKey, hydrationKeyRuntime.resultsHydrationKey]
  );
