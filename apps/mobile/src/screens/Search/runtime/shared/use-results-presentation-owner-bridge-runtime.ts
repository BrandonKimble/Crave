import React from 'react';

import type { ResultsPresentationLog } from './results-presentation-runtime-contract';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import { useResultsPresentationInteractionRuntime } from './use-results-presentation-interaction-runtime';
import { useResultsPresentationRuntimeMachineOwner } from './use-results-presentation-runtime-machine-owner';
import type { SearchSurfaceRedrawCoordinator } from '../controller/search-surface-redraw-coordinator';

type UseResultsPresentationOwnerBridgeRuntimeArgs = {
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
  log: ResultsPresentationLog;
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
};

type ResultsPresentationOwnerBridgeRuntime = {
  markSearchSheetCloseMapExitSettledRef: React.MutableRefObject<(requestKey: string) => void>;
  resultsRuntimeOwner: ResultsPresentationRuntimeOwner;
  interactionModel: ReturnType<typeof useResultsPresentationInteractionRuntime>['interactionModel'];
};

export const useResultsPresentationOwnerBridgeRuntime = ({
  setActiveTab,
  setActiveTabPreference,
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
  log,
  searchSurfaceRedrawCoordinatorRef,
  emitRuntimeMechanismEvent,
}: UseResultsPresentationOwnerBridgeRuntimeArgs): ResultsPresentationOwnerBridgeRuntime => {
  const markSearchSheetCloseMapExitSettledRef = React.useRef<(requestKey: string) => void>(
    () => {}
  );
  const notifyIntentCompleteRef = React.useRef<((intentId: string) => void) | null>(null);

  const { handleToggleInteractionLifecycle, ...resultsRuntimeMachineOwner } =
    useResultsPresentationRuntimeMachineOwner({
      searchRuntimeBus,
      resultsPresentationAuthority,
      resultsPresentationSurfaceAuthority,
      searchMapSourceFramePort,
      log,
      searchSurfaceRedrawCoordinatorRef,
      emitRuntimeMechanismEvent,
      markSearchSheetCloseMapExitSettledRef,
      notifyIntentCompleteRef,
    });

  const resultsInteractionRuntime = useResultsPresentationInteractionRuntime({
    setActiveTab,
    setActiveTabPreference,
    searchRuntimeBus,
    handleToggleInteractionLifecycle,
    notifyIntentCompleteRef,
  });

  /**
   * F1610: the repacker this replaced destructured seventeen named fields, so like the other
   * spread sites in this cluster it was also a runtime FILTER — a bare
   * `{ ...resultsRuntimeMachineOwner, ... }` inline would keep the type but change the value.
   * The fields are named explicitly; the contract type on the memo is what keeps them honest.
   */
  const resultsRuntimeOwner = React.useMemo<ResultsPresentationRuntimeOwner>(
    () => ({
      beginSearchThisAreaPresentationPending: resultsRuntimeMachineOwner.beginSearchThisAreaPresentationPending,
      beginVariantRerunPresentationPending: resultsRuntimeMachineOwner.beginVariantRerunPresentationPending,
      cancelPresentationIntent: resultsRuntimeMachineOwner.cancelPresentationIntent,
      cancelToggleInteraction: resultsInteractionRuntime.cancelToggleInteraction,
      clearStagedSearchSurfaceResultsTransaction: resultsRuntimeMachineOwner.clearStagedSearchSurfaceResultsTransaction,
      commitSearchSurfaceResultsExitTransaction: resultsRuntimeMachineOwner.commitSearchSurfaceResultsExitTransaction,
      handleExecutionBatchMountedHidden: resultsRuntimeMachineOwner.handleExecutionBatchMountedHidden,
      handleMarkerEnterSettled: resultsRuntimeMachineOwner.handleMarkerEnterSettled,
      handleMarkerEnterStarted: resultsRuntimeMachineOwner.handleMarkerEnterStarted,
      handleMarkerExitSettled: resultsRuntimeMachineOwner.handleMarkerExitSettled,
      handleMarkerExitStarted: resultsRuntimeMachineOwner.handleMarkerExitStarted,
      handlePageOneResultsCommitted: resultsRuntimeMachineOwner.handlePageOneResultsCommitted,
      handlePresentationIntentAbort: resultsRuntimeMachineOwner.handlePresentationIntentAbort,
      pendingTogglePresentationIntentId: resultsInteractionRuntime.pendingTogglePresentationIntentId,
      scheduleToggleCommit: resultsInteractionRuntime.scheduleToggleCommit,
      searchSurfaceResultsTransactionKey: resultsRuntimeMachineOwner.searchSurfaceResultsTransactionKey,
      stageSearchSurfaceResultsTransaction: resultsRuntimeMachineOwner.stageSearchSurfaceResultsTransaction,
    }),
    [resultsInteractionRuntime, resultsRuntimeMachineOwner]
  );

  return React.useMemo(
    () => ({
      markSearchSheetCloseMapExitSettledRef,
      resultsRuntimeOwner,
      interactionModel: resultsInteractionRuntime.interactionModel,
    }),
    [resultsRuntimeOwner, resultsInteractionRuntime.interactionModel]
  );
};
