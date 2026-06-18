import React from 'react';

import type { SearchRootFilterModalControlLane } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSearchSceneBusPatch } from './use-search-root-search-scene-bus-patch-runtime';

export const useSearchRootSearchScenePriceSelectorBusPatchRuntime = ({
  filterModalControlLane,
}: {
  filterModalControlLane: SearchRootFilterModalControlLane;
}): Pick<SearchRootSearchSceneBusPatch, 'isPriceSelectorVisible'> =>
  React.useMemo(
    () => ({
      isPriceSelectorVisible: filterModalControlLane.filterModalRuntime.isPriceSelectorVisible,
    }),
    [filterModalControlLane.filterModalRuntime.isPriceSelectorVisible]
  );
