import React from 'react';

import { type ResultsPresentationLog } from './results-presentation-runtime-contract';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import { type SearchRuntimeBus } from './search-runtime-bus';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { ToggleInteractionLifecycleEvent } from './results-toggle-interaction-contract';
import type { SearchSurfaceRedrawCoordinator } from '../controller/search-surface-redraw-coordinator';
import { useResultsPresentationMachineCoreRuntime } from './use-results-presentation-machine-core-runtime';
import { useResultsPresentationMarkerRuntime } from './use-results-presentation-marker-runtime';
import { useResultsPresentationSurfaceTransactionRuntime } from './use-results-presentation-surface-transaction-runtime';

type ResultsPresentationRuntimeMachineOwner = Pick<
  ResultsPresentationRuntimeOwner,
  | 'searchSurfaceResultsTransactionKey'
  | 'beginSearchThisAreaPresentationPending'
  | 'stageSearchSurfaceResultsTransaction'
  | 'commitSearchSurfaceResultsTransaction'
  | 'clearStagedSearchSurfaceResultsTransaction'
  | 'handlePageOneResultsCommitted'
  | 'cancelPresentationIntent'
  | 'handlePresentationIntentAbort'
  | 'handleExecutionBatchMountedHidden'
  | 'handleMarkerEnterStarted'
  | 'handleMarkerEnterSettled'
  | 'handleMarkerExitStarted'
  | 'handleMarkerExitSettled'
> & {
  handleToggleInteractionLifecycle: (event: ToggleInteractionLifecycleEvent) => void;
};

export type UseResultsPresentationRuntimeMachineOwnerArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
  log: ResultsPresentationLog;
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
  markSearchSheetCloseMapExitSettledRef: React.MutableRefObject<(requestKey: string) => void>;
  notifyIntentCompleteRef: React.MutableRefObject<((intentId: string) => void) | null>;
};

export const useResultsPresentationRuntimeMachineOwner = ({
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
  log,
  searchSurfaceRedrawCoordinatorRef,
  emitRuntimeMechanismEvent,
  markSearchSheetCloseMapExitSettledRef,
  notifyIntentCompleteRef,
}: UseResultsPresentationRuntimeMachineOwnerArgs): ResultsPresentationRuntimeMachineOwner => {
  const machineCoreRuntime = useResultsPresentationMachineCoreRuntime({
    resultsPresentationAuthority,
    log,
    notifyIntentCompleteRef,
  });

  const surfaceTransactionRuntime = useResultsPresentationSurfaceTransactionRuntime({
    searchRuntimeBus,
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    searchMapSourceFramePort,
    runtimeMachineRef: machineCoreRuntime.runtimeMachineRef,
    handleRuntimePresentationIntentAbort: machineCoreRuntime.handleRuntimePresentationIntentAbort,
  });

  const markerRuntime = useResultsPresentationMarkerRuntime({
    runtimeMachineRef: machineCoreRuntime.runtimeMachineRef,
    searchSurfaceRedrawCoordinatorRef,
    emitRuntimeMechanismEvent,
    markSearchSheetCloseMapExitSettledRef,
  });

  return React.useMemo(
    () => ({
      searchSurfaceResultsTransactionKey: surfaceTransactionRuntime.searchSurfaceResultsTransactionKey,
      beginSearchThisAreaPresentationPending:
        surfaceTransactionRuntime.beginSearchThisAreaPresentationPending,
      stageSearchSurfaceResultsTransaction: surfaceTransactionRuntime.stageSearchSurfaceResultsTransaction,
      clearStagedSearchSurfaceResultsTransaction:
        surfaceTransactionRuntime.clearStagedSearchSurfaceResultsTransaction,
      handlePageOneResultsCommitted: surfaceTransactionRuntime.handlePageOneResultsCommitted,
      commitSearchSurfaceResultsTransaction: machineCoreRuntime.commitSearchSurfaceResultsTransaction,
      cancelPresentationIntent: machineCoreRuntime.cancelPresentationIntent,
      handleToggleInteractionLifecycle: machineCoreRuntime.handleToggleInteractionLifecycle,
      handlePresentationIntentAbort: surfaceTransactionRuntime.handlePresentationIntentAbort,
      handleExecutionBatchMountedHidden: markerRuntime.handleExecutionBatchMountedHidden,
      handleMarkerEnterStarted: markerRuntime.handleMarkerEnterStarted,
      handleMarkerEnterSettled: markerRuntime.handleMarkerEnterSettled,
      handleMarkerExitStarted: markerRuntime.handleMarkerExitStarted,
      handleMarkerExitSettled: markerRuntime.handleMarkerExitSettled,
    }),
    [machineCoreRuntime, markerRuntime, surfaceTransactionRuntime]
  );
};
