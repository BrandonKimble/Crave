import React from 'react';

import { useSearchFilterModalOwner } from '../../hooks/use-search-filter-modal-owner';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  FilterModalRuntime,
  SubmitRuntimeResult,
} from './use-search-root-control-plane-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';

type UseSearchRootFilterModalRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  resultsPresentationOwner: ResultsPresentationOwner;
  submitRuntimeResult: SubmitRuntimeResult;
};

export const useSearchRootFilterModalRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  resultsPresentationOwner,
  submitRuntimeResult,
}: UseSearchRootFilterModalRuntimeArgs): FilterModalRuntime => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime } = stateFoundationLane;
  const { rootInstrumentationRuntime, rootOverlayStoreRuntime, appRouteSharedSheetRuntimeOwner } =
    rootOverlayFoundationRuntime;

  const filterModalOwner = useSearchFilterModalOwner({
    searchRuntimeBus: sessionCoreLane.searchRuntimeBus,
    searchMode: rootDataPlaneRuntime.runtimeFlags.searchMode,
    submittedQuery: rootDataPlaneRuntime.resultsArrivalState.submittedQuery,
    query: rootPrimitivesRuntime.searchState.query,
    isSearchSessionActive: rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
    openNow: rootDataPlaneRuntime.filterStateRuntime.openNow,
    includeSimilarActive: rootDataPlaneRuntime.filterStateRuntime.includeSimilarActive,
    risingActive: rootDataPlaneRuntime.filterStateRuntime.risingActive,
    priceLevels: rootDataPlaneRuntime.filterStateRuntime.priceLevels,
    panelVisible: appRouteSharedSheetRuntimeOwner.panelVisible,
    setIncludeSimilar: rootDataPlaneRuntime.filterStateRuntime.setIncludeSimilar,
    setRisingActive: rootDataPlaneRuntime.filterStateRuntime.setRisingActive,
    setOpenNow: rootDataPlaneRuntime.filterStateRuntime.setOpenNow,
    setPriceLevels: rootDataPlaneRuntime.filterStateRuntime.setPriceLevels,
    scheduleToggleCommit: resultsPresentationOwner.scheduleToggleCommit,
    resultsRuntimeOwner: resultsPresentationOwner,
    captureFreshTupleBounds: submitRuntimeResult.captureFreshTupleBounds,
    resolveDesiredWorld: submitRuntimeResult.resolveDesiredWorld,
    registerTransientDismissor: rootOverlayStoreRuntime.registerTransientDismissor,
    onMechanismEvent: rootInstrumentationRuntime.emitRuntimeMechanismEvent,
  });

  return React.useMemo(
    () => ({
      ...filterModalOwner,
      openNow: rootDataPlaneRuntime.filterStateRuntime.openNow,
      priceButtonIsActive: rootDataPlaneRuntime.filterStateRuntime.priceLevels.length > 0,
      includeSimilarActive: rootDataPlaneRuntime.filterStateRuntime.includeSimilarActive,
      risingActive: rootDataPlaneRuntime.filterStateRuntime.risingActive,
    }),
    [
      filterModalOwner,
      rootDataPlaneRuntime.filterStateRuntime.openNow,
      rootDataPlaneRuntime.filterStateRuntime.priceLevels.length,
      rootDataPlaneRuntime.filterStateRuntime.includeSimilarActive,
      rootDataPlaneRuntime.filterStateRuntime.risingActive,
    ]
  );
};
