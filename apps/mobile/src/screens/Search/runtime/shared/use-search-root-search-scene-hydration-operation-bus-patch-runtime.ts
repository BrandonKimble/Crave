import React from 'react';

import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootSearchSceneBusPatch } from './use-search-root-search-scene-bus-patch-runtime';

export const useSearchRootSearchSceneHydrationOperationBusPatchRuntime = ({
  stateFoundationLane,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
}): Pick<SearchRootSearchSceneBusPatch, 'hydrationOperationId'> =>
  React.useMemo(
    () => ({
      hydrationOperationId:
        stateFoundationLane.rootDataPlaneRuntime.runtimeFlags
          .hydrationOperationId,
    }),
    [stateFoundationLane.rootDataPlaneRuntime.runtimeFlags.hydrationOperationId]
  );
