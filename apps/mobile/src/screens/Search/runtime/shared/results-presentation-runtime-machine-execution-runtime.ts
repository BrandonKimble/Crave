import type { ResultsPresentationTransportState } from './results-presentation-runtime-contract';
import { resolveEnterMountedHiddenResultsPresentationTransportAttempt } from './results-presentation-runtime-machine-enter-batch-transport';
import {
  resolveEnterNativeStartRequestedResultsPresentationTransportAttempt,
  resolveEnterSettledResultsPresentationTransportAttempt,
  resolveEnterStartedResultsPresentationTransportAttempt,
} from './results-presentation-runtime-machine-enter-completion-transport';
import {
  resolveExitSettledResultsPresentationTransportAttempt,
  resolveExitStartedResultsPresentationTransportAttempt,
} from './results-presentation-runtime-machine-exit-transport';
import type { ResultsPresentationRuntimeMachineOwnerRuntime } from './results-presentation-runtime-machine-owner-runtime';

const areExecutionBatchesEqual = (
  left: ResultsPresentationTransportState['executionBatch'],
  right: ResultsPresentationTransportState['executionBatch']
): boolean =>
  left == null && right == null
    ? true
    : left != null &&
      right != null &&
      left.batchId === right.batchId &&
      left.generationId === right.generationId;

export const createResultsPresentationRuntimeMachineExecutionRuntime = ({
  ownerRuntime,
  now,
  onIntentComplete,
}: {
  ownerRuntime: ResultsPresentationRuntimeMachineOwnerRuntime;
  now: () => number;
  onIntentComplete?: (intentId: string) => void;
}) => ({
  markEnterBatchMountedHidden(
    intentId: string,
    executionBatch: NonNullable<ResultsPresentationTransportState['executionBatch']>
  ) {
    return (
      ownerRuntime.applyAttempt((draft) =>
        resolveEnterMountedHiddenResultsPresentationTransportAttempt(draft, {
          requestKey: intentId,
          executionBatch,
        })
      ) != null
    );
  },
  markEnterStarted(
    intentId: string,
    executionBatch: ResultsPresentationTransportState['executionBatch']
  ) {
    const state = ownerRuntime.getState();
    if (
      state.transactionId === intentId &&
      state.snapshotKind !== 'results_exit' &&
      state.executionStage === 'enter_executing' &&
      state.coverState === 'hidden' &&
      areExecutionBatchesEqual(state.executionBatch, executionBatch ?? state.executionBatch)
    ) {
      return true;
    }

    return (
      ownerRuntime.applyAttempt((draft) =>
        resolveEnterStartedResultsPresentationTransportAttempt(draft, {
          requestKey: intentId,
          executionBatch,
          startToken: now(),
        })
      ) != null
    );
  },
  markEnterNativeStartRequested(
    intentId: string,
    executionBatch: ResultsPresentationTransportState['executionBatch']
  ) {
    const state = ownerRuntime.getState();
    if (
      state.transactionId === intentId &&
      state.snapshotKind !== 'results_exit' &&
      state.executionStage === 'enter_executing' &&
      areExecutionBatchesEqual(state.executionBatch, executionBatch ?? state.executionBatch)
    ) {
      return true;
    }

    return (
      ownerRuntime.applyAttempt((draft) =>
        resolveEnterNativeStartRequestedResultsPresentationTransportAttempt(draft, {
          requestKey: intentId,
          executionBatch,
          startToken: now(),
        })
      ) != null
    );
  },
  getEnterStartToken() {
    return ownerRuntime.getState().startToken ?? null;
  },
  markEnterBatchSettled(
    intentId: string,
    executionBatch: ResultsPresentationTransportState['executionBatch']
  ) {
    const attempt = ownerRuntime.applyResolvedAttempt(
      resolveEnterSettledResultsPresentationTransportAttempt(ownerRuntime.getState(), {
        requestKey: intentId,
        executionBatch,
      })
    );

    if (attempt == null) {
      return false;
    }

    if (attempt.completedIntentId != null) {
      onIntentComplete?.(attempt.completedIntentId);
    }

    return true;
  },
  markExitStarted(payload: { requestKey: string; startedAtMs: number }) {
    const state = ownerRuntime.getState();
    if (
      state.snapshotKind === 'results_exit' &&
      state.transactionId === payload.requestKey &&
      state.executionStage === 'exit_executing'
    ) {
      return true;
    }

    return (
      ownerRuntime.applyAttempt((draft) =>
        resolveExitStartedResultsPresentationTransportAttempt(draft, payload)
      ) != null
    );
  },
  markExitSettled(payload: { requestKey: string; settledAtMs: number }) {
    return (
      ownerRuntime.applyAttempt((draft) =>
        resolveExitSettledResultsPresentationTransportAttempt(draft, payload)
      ) != null
    );
  },
});
