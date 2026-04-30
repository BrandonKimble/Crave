import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchRootSearchSceneBusPatch } from './use-search-root-search-scene-bus-patch-runtime';

export const useSearchRootSearchSceneBusPublishEffectRuntime = ({
  searchRuntimeBus,
  searchRouteSceneBusPatch,
}: {
  searchRuntimeBus: SearchRuntimeBus;
  searchRouteSceneBusPatch: SearchRootSearchSceneBusPatch;
}) => {
  React.useEffect(() => {
    searchRuntimeBus.publish(searchRouteSceneBusPatch);
  }, [searchRouteSceneBusPatch, searchRuntimeBus]);
};
