import React from 'react';

import type {
  SearchRootForegroundInteractionControlLane,
} from './use-search-root-control-plane-runtime-contract';

export const useSearchRootOverlayShortcutsInteractionRuntime = ({
  foregroundInteractionControlLane,
}: {
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
}) =>
  React.useMemo(
    () => ({
      handleBestRestaurantsHere:
        foregroundInteractionControlLane.foregroundInteractionRuntime
          .handleBestRestaurantsHere,
      handleBestDishesHere:
        foregroundInteractionControlLane.foregroundInteractionRuntime
          .handleBestDishesHere,
    }),
    [
      foregroundInteractionControlLane.foregroundInteractionRuntime
        .handleBestDishesHere,
      foregroundInteractionControlLane.foregroundInteractionRuntime
        .handleBestRestaurantsHere,
    ]
  );
