import React from 'react';

import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import type { SearchRootSearchSceneListHydrationPatch } from './use-search-root-search-scene-list-hydration-patch-runtime';
import { useSearchRootSearchSceneListHydrationKeysPatchRuntime } from './use-search-root-search-scene-list-hydration-keys-patch-runtime';
import { useSearchRootSearchSceneListHydrationRenderGatePatchRuntime } from './use-search-root-search-scene-list-hydration-render-gate-patch-runtime';

export const useSearchRootSearchSceneListHydrationKeyPatchRuntime = ({
  hydrationKeyRuntime,
}: {
  hydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
}): Pick<
  SearchRootSearchSceneListHydrationPatch,
  'resultsHydrationKey' | 'hydratedResultsKey' | 'shouldHydrateResultsForRender'
> => ({
  ...useSearchRootSearchSceneListHydrationKeysPatchRuntime({
    hydrationKeyRuntime,
  }),
  ...useSearchRootSearchSceneListHydrationRenderGatePatchRuntime({
    hydrationKeyRuntime,
  }),
});
