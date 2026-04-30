import React from 'react';

import type { SearchRootForegroundInteractionControlLane } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSearchSceneBusPatch } from './use-search-root-search-scene-bus-patch-runtime';

export const useSearchRootSearchSceneReconnectBusPatchRuntime = ({
  foregroundInteractionControlLane,
}: {
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
}): Pick<SearchRootSearchSceneBusPatch, 'shouldRetrySearchOnReconnect'> =>
  React.useMemo(
    () => ({
      shouldRetrySearchOnReconnect:
        foregroundInteractionControlLane.foregroundInteractionRuntime
          .shouldRetrySearchOnReconnect,
    }),
    [
      foregroundInteractionControlLane.foregroundInteractionRuntime
        .shouldRetrySearchOnReconnect,
    ]
  );
