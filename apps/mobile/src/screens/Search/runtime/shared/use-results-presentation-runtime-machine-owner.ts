import React from 'react';

import { type ResultsPresentationLog } from './results-presentation-runtime-contract';
import { type SearchRuntimeBus } from './search-runtime-bus';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { ToggleInteractionLifecycleEvent } from './results-toggle-interaction-contract';
import type { RunOneHandoffCoordinator } from '../controller/run-one-handoff-coordinator';
import { useResultsPresentationMachineCoreRuntime } from './use-results-presentation-machine-core-runtime';
import { useResultsPresentationMarkerRuntime } from './use-results-presentation-marker-runtime';
import { useResultsPresentationPreparedSnapshotRuntime } from './use-results-presentation-prepared-snapshot-runtime';

type ResultsPresentationRuntimeMachineOwner = Pick<
  ResultsPresentationRuntimeOwner,
  | 'preparedResultsSnapshotKey'
  | 'stagePreparedResultsSnapshot'
  | 'commitPreparedResultsSnapshot'
  | 'clearStagedPreparedResultsSnapshot'
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
  log: ResultsPresentationLog;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
  markSearchSheetCloseMapExitSettledRef: React.MutableRefObject<(requestKey: string) => void>;
  notifyIntentCompleteRef: React.MutableRefObject<((intentId: string) => void) | null>;
};

export const useResultsPresentationRuntimeMachineOwner = ({
  searchRuntimeBus,
  log,
  runOneHandoffCoordinatorRef,
  emitRuntimeMechanismEvent,
  markSearchSheetCloseMapExitSettledRef,
  notifyIntentCompleteRef,
}: UseResultsPresentationRuntimeMachineOwnerArgs): ResultsPresentationRuntimeMachineOwner => {
  const machineCoreRuntime = useResultsPresentationMachineCoreRuntime({
    searchRuntimeBus,
    log,
    notifyIntentCompleteRef,
  });

  const preparedSnapshotRuntime = useResultsPresentationPreparedSnapshotRuntime({
    searchRuntimeBus,
    runtimeMachineRef: machineCoreRuntime.runtimeMachineRef,
    handleRuntimePresentationIntentAbort:
      machineCoreRuntime.handleRuntimePresentationIntentAbort,
  });

  const markerRuntime = useResultsPresentationMarkerRuntime({
    runtimeMachineRef: machineCoreRuntime.runtimeMachineRef,
    runOneHandoffCoordinatorRef,
    emitRuntimeMechanismEvent,
    markSearchSheetCloseMapExitSettledRef,
  });

  return React.useMemo(
    () => ({
      preparedResultsSnapshotKey: preparedSnapshotRuntime.preparedResultsSnapshotKey,
      stagePreparedResultsSnapshot: preparedSnapshotRuntime.stagePreparedResultsSnapshot,
      clearStagedPreparedResultsSnapshot:
        preparedSnapshotRuntime.clearStagedPreparedResultsSnapshot,
      handlePageOneResultsCommitted:
        preparedSnapshotRuntime.handlePageOneResultsCommitted,
      commitPreparedResultsSnapshot:
        machineCoreRuntime.commitPreparedResultsSnapshot,
      cancelPresentationIntent: machineCoreRuntime.cancelPresentationIntent,
      handleToggleInteractionLifecycle:
        machineCoreRuntime.handleToggleInteractionLifecycle,
      handlePresentationIntentAbort:
        preparedSnapshotRuntime.handlePresentationIntentAbort,
      handleExecutionBatchMountedHidden:
        markerRuntime.handleExecutionBatchMountedHidden,
      handleMarkerEnterStarted: markerRuntime.handleMarkerEnterStarted,
      handleMarkerEnterSettled: markerRuntime.handleMarkerEnterSettled,
      handleMarkerExitStarted: markerRuntime.handleMarkerExitStarted,
      handleMarkerExitSettled: markerRuntime.handleMarkerExitSettled,
    }),
    [machineCoreRuntime, markerRuntime, preparedSnapshotRuntime]
  );
};
