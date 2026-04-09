import React from 'react';

import { type ResultsPresentationLog } from './results-presentation-runtime-contract';
import { type SearchRuntimeBus } from './search-runtime-bus';
import { type PreparedResultsPresentationSnapshot } from './prepared-presentation-transaction';
import {
  createResultsPresentationRuntimeMachine,
  type ResultsPresentationRuntimeMachine,
} from './results-presentation-runtime-machine';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { ToggleInteractionLifecycleEvent } from './results-toggle-interaction-contract';
import type { RunOneHandoffCoordinator } from '../controller/run-one-handoff-coordinator';
import { useResultsPresentationStagingRuntime } from './use-results-presentation-staging-runtime';
import { useResultsPresentationMarkerHandoffRuntime } from './use-results-presentation-marker-handoff-runtime';

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
  const runtimeMachineRef = React.useRef<ResultsPresentationRuntimeMachine | null>(null);

  if (!runtimeMachineRef.current) {
    runtimeMachineRef.current = createResultsPresentationRuntimeMachine({
      publish: ({ resultsPresentation, resultsPresentationTransport }) => {
        searchRuntimeBus.publish({
          resultsPresentation,
          resultsPresentationTransport,
        });
      },
      log,
      onIntentComplete: (intentId) => {
        notifyIntentCompleteRef.current?.(intentId);
      },
    });
  }

  const handleToggleInteractionLifecycle = React.useCallback(
    (event: ToggleInteractionLifecycleEvent) => {
      runtimeMachineRef.current?.handleToggleInteractionLifecycle(event);
    },
    []
  );

  const commitPreparedResultsSnapshot = React.useCallback(
    (snapshot: PreparedResultsPresentationSnapshot) => {
      runtimeMachineRef.current!.commitPreparedResultsSnapshot(snapshot);
    },
    []
  );

  const cancelPresentationIntent = React.useCallback((intentId?: string) => {
    runtimeMachineRef.current?.cancelPresentationIntent(intentId);
  }, []);

  const handleRuntimePresentationIntentAbort = React.useCallback(() => {
    runtimeMachineRef.current?.handlePresentationIntentAbort();
  }, []);

  const stagingRuntime = useResultsPresentationStagingRuntime({
    searchRuntimeBus,
    applyStagingCoverState: (coverState) => {
      runtimeMachineRef.current!.applyStagingCoverState(coverState);
    },
    commitPreparedResultsSnapshot,
    handleRuntimePresentationIntentAbort,
  });

  const markerHandoffRuntime = useResultsPresentationMarkerHandoffRuntime({
    runOneHandoffCoordinatorRef,
    emitRuntimeMechanismEvent,
    markSearchSheetCloseMapExitSettledRef,
    markEnterBatchMountedHidden: (requestKey, executionBatch) =>
      runtimeMachineRef.current!.markEnterBatchMountedHidden(requestKey, executionBatch),
    markEnterStarted: (requestKey, executionBatch) =>
      runtimeMachineRef.current!.markEnterStarted(requestKey, executionBatch),
    markEnterBatchSettled: (requestKey, executionBatch) =>
      runtimeMachineRef.current!.markEnterBatchSettled(requestKey, executionBatch),
    markExitStarted: (payload) => runtimeMachineRef.current!.markExitStarted(payload),
    markExitSettled: (payload) => runtimeMachineRef.current!.markExitSettled(payload),
  });

  return React.useMemo(
    () => ({
      commitPreparedResultsSnapshot,
      cancelPresentationIntent,
      handleToggleInteractionLifecycle,
      ...stagingRuntime,
      ...markerHandoffRuntime,
    }),
    [
      cancelPresentationIntent,
      commitPreparedResultsSnapshot,
      handleToggleInteractionLifecycle,
      markerHandoffRuntime,
      stagingRuntime,
    ]
  );
};
