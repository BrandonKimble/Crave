import React from 'react';

import type { SearchRootFilterModalControlLane } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSearchSceneBusPatch } from './use-search-root-search-scene-bus-patch-runtime';
import { useSearchRootSearchSceneFilterChipBusPatchRuntime } from './use-search-root-search-scene-filter-chip-bus-patch-runtime';
import { useSearchRootSearchScenePriceSelectorBusPatchRuntime } from './use-search-root-search-scene-price-selector-bus-patch-runtime';

export const useSearchRootSearchSceneFilterBusPatchRuntime = ({
  filterModalControlLane,
}: {
  filterModalControlLane: SearchRootFilterModalControlLane;
}): Pick<
  SearchRootSearchSceneBusPatch,
  | 'priceButtonLabelText'
  | 'priceButtonIsActive'
  | 'isPriceSelectorVisible'
  | 'isSortSelectorVisible'
> => ({
  ...useSearchRootSearchSceneFilterChipBusPatchRuntime({
    filterModalControlLane,
  }),
  ...useSearchRootSearchScenePriceSelectorBusPatchRuntime({
    filterModalControlLane,
  }),
});
