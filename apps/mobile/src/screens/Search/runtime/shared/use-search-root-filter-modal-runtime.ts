import React from 'react';

import { registerSearchReconcilerPresentationPort } from '../reconciler/search-reconciler-presentation-port';
import { createSearchSurfaceResultsEnterTransaction } from './search-surface-results-transaction';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';

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
  const { rootDataPlaneRuntime } = stateFoundationLane;
  const { rootInstrumentationRuntime, rootOverlayStoreRuntime, appRouteSharedSheetRuntimeOwner } =
    rootOverlayFoundationRuntime;

  // S4b strangler glue (dies in S4c): the reconciler drives the toggle coordinator +
  // pending-cover arm through this port — the composition that owns them registers it.
  React.useEffect(
    () =>
      registerSearchReconcilerPresentationPort({
        scheduleToggleCommit: resultsPresentationOwner.scheduleToggleCommit,
        beginVariantRerunPresentationPending:
          resultsPresentationOwner.beginVariantRerunPresentationPending,
        clearStagedSearchSurfaceResultsTransaction:
          resultsPresentationOwner.clearStagedSearchSurfaceResultsTransaction,
        presentTabSwitch: ({ intentId, targetTab }) => {
          const searchRuntimeBus = sessionCoreLane.searchRuntimeBus;
          resultsPresentationOwner.clearStagedSearchSurfaceResultsTransaction();
          // Direct PRESENTED-tab publish (never the tuple writer): the desire already
          // holds targetTab; this is the presentation catching up under the cover.
          if (searchRuntimeBus.getState().activeTab !== targetTab) {
            searchRuntimeBus.publish({ activeTab: targetTab, pendingTabSwitchTab: null });
          } else {
            searchRuntimeBus.publish({ pendingTabSwitchTab: null });
          }
          getSearchSurfaceRuntime().beginRedrawTransaction({
            reason: 'toggle',
            transactionId: intentId,
            targetTab,
            coverState: 'interaction_loading',
          });
          resultsPresentationOwner.stageSearchSurfaceResultsTransaction(
            createSearchSurfaceResultsEnterTransaction(
              intentId,
              'initial_search',
              'interaction_loading',
              null,
              'cache'
            )
          );
        },
      }),
    [resultsPresentationOwner, sessionCoreLane.searchRuntimeBus]
  );
  const filterModalOwner = useSearchFilterModalOwner({
    searchRuntimeBus: sessionCoreLane.searchRuntimeBus,
    openNow: rootDataPlaneRuntime.filterStateRuntime.openNow,
    includeSimilarActive: rootDataPlaneRuntime.filterStateRuntime.includeSimilarActive,
    risingActive: rootDataPlaneRuntime.filterStateRuntime.risingActive,
    priceLevels: rootDataPlaneRuntime.filterStateRuntime.priceLevels,
    panelVisible: appRouteSharedSheetRuntimeOwner.panelVisible,
    setIncludeSimilar: rootDataPlaneRuntime.filterStateRuntime.setIncludeSimilar,
    setRisingActive: rootDataPlaneRuntime.filterStateRuntime.setRisingActive,
    setOpenNow: rootDataPlaneRuntime.filterStateRuntime.setOpenNow,
    setPriceLevels: rootDataPlaneRuntime.filterStateRuntime.setPriceLevels,
    captureFreshTupleBounds: submitRuntimeResult.captureFreshTupleBounds,
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
