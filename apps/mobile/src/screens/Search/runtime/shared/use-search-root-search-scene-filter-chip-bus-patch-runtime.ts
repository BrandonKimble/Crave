import React from 'react';

import type { SearchRootFilterModalControlLane } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSearchSceneBusPatch } from './use-search-root-search-scene-bus-patch-runtime';

export const useSearchRootSearchSceneFilterChipBusPatchRuntime = ({
  filterModalControlLane,
}: {
  filterModalControlLane: SearchRootFilterModalControlLane;
}): Pick<
  SearchRootSearchSceneBusPatch,
  'priceButtonLabelText' | 'priceButtonIsActive' | 'openNow' | 'votesFilterActive' | 'risingActive'
> =>
  React.useMemo(
    () => ({
      priceButtonLabelText: filterModalControlLane.filterModalRuntime.priceButtonLabelText,
      priceButtonIsActive: filterModalControlLane.filterModalRuntime.priceButtonIsActive,
      openNow: filterModalControlLane.filterModalRuntime.openNow,
      votesFilterActive: filterModalControlLane.filterModalRuntime.votesFilterActive,
      risingActive: filterModalControlLane.filterModalRuntime.risingActive,
    }),
    [
      filterModalControlLane.filterModalRuntime.openNow,
      filterModalControlLane.filterModalRuntime.priceButtonIsActive,
      filterModalControlLane.filterModalRuntime.priceButtonLabelText,
      filterModalControlLane.filterModalRuntime.votesFilterActive,
      filterModalControlLane.filterModalRuntime.risingActive,
    ]
  );
