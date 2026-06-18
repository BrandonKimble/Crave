import React from 'react';

import type { SearchForegroundHeaderSearchThisAreaInteractionInputs } from './search-foreground-chrome-contract';
import type { SearchRootForegroundInteractionControlLane } from './use-search-root-control-plane-runtime-contract';

export const useSearchRootOverlayHeaderSearchThisAreaInteractionRuntime = ({
  foregroundInteractionControlLane,
}: {
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
}): SearchForegroundHeaderSearchThisAreaInteractionInputs =>
  React.useMemo(
    () => ({
      handleSearchThisArea:
        foregroundInteractionControlLane.foregroundInteractionRuntime.handleSearchThisArea,
    }),
    [foregroundInteractionControlLane.foregroundInteractionRuntime.handleSearchThisArea]
  );
