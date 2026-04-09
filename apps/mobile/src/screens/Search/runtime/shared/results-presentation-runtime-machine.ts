import type { PreparedResultsPresentationSnapshot } from './prepared-presentation-transaction';
import type {
  ResultsPresentationLog,
  ResultsPresentationTransportState,
} from './results-presentation-runtime-contract';
import type { ToggleInteractionLifecycleEvent } from './results-toggle-interaction-contract';
import {
  type ResultsPresentationRuntimeState,
  resolveIdleResultsPresentationTransportState,
  resolveResultsPresentationRuntimeState,
} from './results-presentation-runtime-machine-state';
import {
  type AppliedResultsPresentationRuntimeAttempt,
  type ResultsPresentationNamedTransportAttempt,
  applyResultsPresentationNamedTransportAttempt,
} from './results-presentation-runtime-machine-transport-primitives';
import { resolveNamedAppliedResultsPresentationCoverStateTransportAttempt } from './results-presentation-runtime-machine-cover-state-transport';
import {
  resolveAbortedResultsPresentationTransportAttempt,
  resolveCancelledResultsPresentationTransportAttempt,
  resolveCommittedResultsPresentationTransportAttempt,
  resolveToggleInteractionLifecycleTransportAttempt,
} from './results-presentation-runtime-machine-intent-lifecycle-transport';
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

type ResultsPresentationRuntimeMachineOptions = {
  publish: (payload: ResultsPresentationRuntimeState) => void;
  log?: ResultsPresentationLog;
  onIntentComplete?: (intentId: string) => void;
  now?: () => number;
};

export type ResultsPresentationRuntimeMachine = {
  applyStagingCoverState: (nextCoverState: 'initial_loading' | 'interaction_loading') => void;
  handleToggleInteractionLifecycle: (event: ToggleInteractionLifecycleEvent) => void;
  handlePresentationIntentAbort: () => void;
  commitPreparedResultsSnapshot: (snapshot: PreparedResultsPresentationSnapshot) => void;
  cancelPresentationIntent: (intentId?: string) => void;
  markEnterBatchMountedHidden: (
    intentId: string,
    executionBatch: NonNullable<ResultsPresentationTransportState['executionBatch']>
  ) => boolean;
  markEnterStarted: (
    intentId: string,
    executionBatch: ResultsPresentationTransportState['executionBatch']
  ) => boolean;
  markEnterBatchSettled: (
    intentId: string,
    executionBatch: ResultsPresentationTransportState['executionBatch']
  ) => boolean;
  markExitStarted: (payload: { requestKey: string; startedAtMs: number }) => boolean;
  markExitSettled: (payload: { requestKey: string; settledAtMs: number }) => boolean;
};

const NOOP_RESULTS_PRESENTATION_LOG: ResultsPresentationLog = () => {};
export const createResultsPresentationRuntimeMachine = (
  options: ResultsPresentationRuntimeMachineOptions
): ResultsPresentationRuntimeMachine => {
  const publish = options.publish;
  const log = options.log ?? NOOP_RESULTS_PRESENTATION_LOG;
  const onIntentComplete = options.onIntentComplete;
  const now = options.now ?? Date.now;
  let state: ResultsPresentationTransportState = resolveIdleResultsPresentationTransportState();

  const applyResolvedAttempt = (attempt: AppliedResultsPresentationRuntimeAttempt) => {
    if (attempt.blockedLog != null) {
      log(attempt.blockedLog.label, attempt.blockedLog.data);
    }

    if (!attempt.didApply || attempt.appliedLog == null) {
      return null;
    }

    if (attempt.nextState != null) {
      state = attempt.nextState;
      publish(resolveResultsPresentationRuntimeState(state));
    }

    log(attempt.appliedLog.label, attempt.appliedLog.data);
    return attempt;
  };

  const applyAttempt = (
    resolveAttempt: (
      draft: ResultsPresentationTransportState
    ) => ResultsPresentationNamedTransportAttempt
  ) =>
    applyResolvedAttempt(
      applyResultsPresentationNamedTransportAttempt({
        state,
        resolveAttempt,
      })
    );

  publish(resolveResultsPresentationRuntimeState(state));

  return {
    applyStagingCoverState(nextCoverState) {
      applyAttempt((draft) =>
        resolveNamedAppliedResultsPresentationCoverStateTransportAttempt(
          draft,
          nextCoverState,
          'applyStagingCoverState'
        )
      );
    },
    handleToggleInteractionLifecycle(event) {
      applyAttempt((draft) => resolveToggleInteractionLifecycleTransportAttempt(draft, event));
    },
    handlePresentationIntentAbort() {
      applyAttempt((draft) => resolveAbortedResultsPresentationTransportAttempt(draft));
    },
    commitPreparedResultsSnapshot(snapshot) {
      applyAttempt(() => resolveCommittedResultsPresentationTransportAttempt(snapshot));
    },
    cancelPresentationIntent(intentId) {
      applyAttempt((draft) => resolveCancelledResultsPresentationTransportAttempt(draft, intentId));
    },
    markEnterBatchMountedHidden(intentId, executionBatch) {
      const attempt = applyAttempt((draft) =>
        resolveEnterMountedHiddenResultsPresentationTransportAttempt(draft, {
          requestKey: intentId,
          executionBatch,
        })
      );

      if (attempt == null) {
        return false;
      }

      applyAttempt((draft) =>
        resolveStartedEnterExecutionBatchResultsPresentationTransportAttempt(draft, now())
      );

      return true;
    },
    markEnterStarted(intentId, executionBatch) {
      return (
        applyAttempt((draft) =>
          resolveEnterStartedResultsPresentationTransportAttempt(draft, {
            requestKey: intentId,
            executionBatch,
          })
        ) != null
      );
    },
    markEnterBatchSettled(intentId, executionBatch) {
      const attempt = applyResolvedAttempt(
        resolveEnterSettledResultsPresentationTransportAttempt(state, {
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
    markExitStarted(payload) {
      return (
        applyAttempt((draft) =>
          resolveExitStartedResultsPresentationTransportAttempt(draft, payload)
        ) != null
      );
    },
    markExitSettled(payload) {
      return (
        applyAttempt((draft) =>
          resolveExitSettledResultsPresentationTransportAttempt(draft, payload)
        ) != null
      );
    },
  };
};
