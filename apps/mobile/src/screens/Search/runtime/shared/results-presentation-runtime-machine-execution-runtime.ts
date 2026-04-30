import type { ResultsPresentationTransportState } from './results-presentation-runtime-contract';
import {
  resolveEnterMountedHiddenResultsPresentationTransportAttempt,
  resolveStartedEnterExecutionBatchResultsPresentationTransportAttempt,
} from './results-presentation-runtime-machine-enter-batch-transport';
import {
  resolveEnterSettledResultsPresentationTransportAttempt,
  resolveEnterStartedResultsPresentationTransportAttempt,
} from './results-presentation-runtime-machine-enter-completion-transport';
import {
  resolveExitSettledResultsPresentationTransportAttempt,
  resolveExitStartedResultsPresentationTransportAttempt,
} from './results-presentation-runtime-machine-exit-transport';
import type { ResultsPresentationRuntimeMachineOwnerRuntime } from './results-presentation-runtime-machine-owner-runtime';

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
    const attempt = ownerRuntime.applyAttempt((draft) =>
      resolveEnterMountedHiddenResultsPresentationTransportAttempt(draft, {
        requestKey: intentId,
        executionBatch,
      })
    );

    if (attempt == null) {
      return false;
    }

    ownerRuntime.applyAttempt((draft) =>
      resolveStartedEnterExecutionBatchResultsPresentationTransportAttempt(
        draft,
        now()
      )
    );

    return true;
  },
  markEnterStarted(
    intentId: string,
    executionBatch: ResultsPresentationTransportState['executionBatch']
  ) {
    return (
      ownerRuntime.applyAttempt((draft) =>
        resolveEnterStartedResultsPresentationTransportAttempt(draft, {
          requestKey: intentId,
          executionBatch,
        })
      ) != null
    );
  },
  markEnterBatchSettled(
    intentId: string,
    executionBatch: ResultsPresentationTransportState['executionBatch']
  ) {
    const attempt = ownerRuntime.applyResolvedAttempt(
      resolveEnterSettledResultsPresentationTransportAttempt(
        ownerRuntime.getState(),
        {
          requestKey: intentId,
          executionBatch,
        }
      )
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
