import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';

// F1012 *-patch-runtime collapse: this type lived in
// use-search-root-search-scene-bus-patch-runtime.ts, the root of a six-file spread chain
// that assembled it. The chain is inlined into
// use-search-root-search-scene-bus-publication-runtime.ts; the type now lives with the
// publish effect that consumes it.
// R1c: openNow / includeSimilarActive / risingActive are no longer part of this patch — they
// are bus-authoritative and single-written by the toggle runner / filter-state runtime.
export type SearchRootSearchSceneBusPatch = {
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  isPriceSelectorVisible: boolean;
  isSortSelectorVisible: boolean;
  shouldRetrySearchOnReconnect: boolean;
};

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
