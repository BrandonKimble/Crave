import React from 'react';

import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import type { SearchRootSearchSceneListHydrationPatch } from './use-search-root-search-scene-list-hydration-patch-runtime';

export const useSearchRootSearchSceneListHydrationRenderGatePatchRuntime = ({
  hydrationKeyRuntime,
}: {
  hydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
}): Pick<
  SearchRootSearchSceneListHydrationPatch,
  'shouldHydrateResultsForRender'
> =>
  React.useMemo(
    () => ({
      shouldHydrateResultsForRender:
        hydrationKeyRuntime.shouldHydrateResultsForRender,
    }),
    [hydrationKeyRuntime.shouldHydrateResultsForRender]
  );
