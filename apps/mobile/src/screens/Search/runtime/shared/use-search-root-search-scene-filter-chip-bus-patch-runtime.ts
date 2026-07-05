import React from 'react';

import type { SearchRootFilterModalControlLane } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSearchSceneBusPatch } from './use-search-root-search-scene-bus-patch-runtime';

// R1c: openNow / votesFilterActive / risingActive are bus-authoritative (written by the
// toggle runner / filter-state runtime) — this patch no longer republishes them. Only the
// derived price-chip presentation fields flow through here.
export const useSearchRootSearchSceneFilterChipBusPatchRuntime = ({
  filterModalControlLane,
}: {
  filterModalControlLane: SearchRootFilterModalControlLane;
}): Pick<SearchRootSearchSceneBusPatch, 'priceButtonLabelText' | 'priceButtonIsActive'> =>
  React.useMemo(
    () => ({
      priceButtonLabelText: filterModalControlLane.filterModalRuntime.priceButtonLabelText,
      priceButtonIsActive: filterModalControlLane.filterModalRuntime.priceButtonIsActive,
    }),
    [
      filterModalControlLane.filterModalRuntime.priceButtonIsActive,
      filterModalControlLane.filterModalRuntime.priceButtonLabelText,
    ]
  );
