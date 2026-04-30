import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchRootSearchSceneListHydrationPatch } from './use-search-root-search-scene-list-hydration-patch-runtime';

export const useSearchRootSearchSceneListHydrationPublishEffectRuntime = ({
  searchRuntimeBus,
  searchSceneListHydrationPatch,
}: {
  searchRuntimeBus: SearchRuntimeBus;
  searchSceneListHydrationPatch: SearchRootSearchSceneListHydrationPatch;
}) => {
  React.useEffect(() => {
    searchRuntimeBus.publish(searchSceneListHydrationPatch);
  }, [searchRuntimeBus, searchSceneListHydrationPatch]);
};
