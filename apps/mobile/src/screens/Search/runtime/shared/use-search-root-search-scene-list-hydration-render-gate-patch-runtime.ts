import React from 'react';

import type { SearchRootSearchSceneListHydrationPatch } from './use-search-root-search-scene-list-hydration-patch-runtime';

const LEAF_OWNED_HYDRATION_RENDER_GATE_PATCH = {
  shouldHydrateResultsForRender: false,
} as const satisfies Pick<SearchRootSearchSceneListHydrationPatch, 'shouldHydrateResultsForRender'>;

export const useSearchRootSearchSceneListHydrationRenderGatePatchRuntime = (): Pick<
  SearchRootSearchSceneListHydrationPatch,
  'shouldHydrateResultsForRender'
> => React.useMemo(() => LEAF_OWNED_HYDRATION_RENDER_GATE_PATCH, []);
