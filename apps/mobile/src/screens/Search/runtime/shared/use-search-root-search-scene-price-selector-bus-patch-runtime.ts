import React from 'react';

import type { SearchRootFilterModalControlLane } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSearchSceneBusPatch } from './use-search-root-search-scene-bus-patch-runtime';

export const useSearchRootSearchScenePriceSelectorBusPatchRuntime = ({
  filterModalControlLane,
}: {
  filterModalControlLane: SearchRootFilterModalControlLane;
}): Pick<SearchRootSearchSceneBusPatch, 'isPriceSelectorVisible' | 'isSortSelectorVisible'> =>
  React.useMemo(
    () => ({
      isPriceSelectorVisible: filterModalControlLane.filterModalRuntime.isPriceSelectorVisible,
      isSortSelectorVisible: filterModalControlLane.filterModalRuntime.isSortSelectorVisible,
    }),
    [
      filterModalControlLane.filterModalRuntime.isPriceSelectorVisible,
      filterModalControlLane.filterModalRuntime.isSortSelectorVisible,
    ]
  );
