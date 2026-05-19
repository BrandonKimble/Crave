import type {
  ResultsPresentationLog,
  ResultsPresentationTransportState,
} from './results-presentation-runtime-contract';
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

const NOOP_RESULTS_PRESENTATION_LOG: ResultsPresentationLog = () => {};

export type ResultsPresentationRuntimeMachineOwnerRuntime = {
  getState: () => ResultsPresentationTransportState;
  applyResolvedAttempt: (
    attempt: AppliedResultsPresentationRuntimeAttempt
  ) => AppliedResultsPresentationRuntimeAttempt | null;
  applyTransaction: (
    resolveAttempts: Array<
      (draft: ResultsPresentationTransportState) => ResultsPresentationNamedTransportAttempt
    >
  ) => AppliedResultsPresentationRuntimeAttempt[] | null;
  applyAttempt: (
    resolveAttempt: (
      draft: ResultsPresentationTransportState
    ) => ResultsPresentationNamedTransportAttempt
  ) => AppliedResultsPresentationRuntimeAttempt | null;
};

export const createResultsPresentationRuntimeMachineOwnerRuntime = ({
  publish,
  log = NOOP_RESULTS_PRESENTATION_LOG,
}: {
  publish: (payload: ResultsPresentationRuntimeState) => void;
  log?: ResultsPresentationLog;
}): ResultsPresentationRuntimeMachineOwnerRuntime => {
  let state: ResultsPresentationTransportState = resolveIdleResultsPresentationTransportState();

  const applyResolvedAttempt = (
    attempt: AppliedResultsPresentationRuntimeAttempt
  ): AppliedResultsPresentationRuntimeAttempt | null => {
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

  const applyResolvedTransaction = (
    attempts: AppliedResultsPresentationRuntimeAttempt[]
  ): AppliedResultsPresentationRuntimeAttempt[] | null => {
    attempts.forEach((attempt) => {
      if (attempt.blockedLog != null) {
        log(attempt.blockedLog.label, attempt.blockedLog.data);
      }
    });

    const appliedAttempts = attempts.filter((attempt) => attempt.didApply);
    if (appliedAttempts.length === 0) {
      return null;
    }

    const finalAppliedAttempt = appliedAttempts[appliedAttempts.length - 1];
    if (finalAppliedAttempt.nextState != null) {
      state = finalAppliedAttempt.nextState;
      publish(resolveResultsPresentationRuntimeState(state));
    }

    appliedAttempts.forEach((attempt) => {
      if (attempt.appliedLog != null) {
        log(attempt.appliedLog.label, attempt.appliedLog.data);
      }
    });

    return appliedAttempts;
  };

  publish(resolveResultsPresentationRuntimeState(state));

  return {
    getState: () => state,
    applyResolvedAttempt,
    applyTransaction: (resolveAttempts) => {
      const attempts: AppliedResultsPresentationRuntimeAttempt[] = [];
      let transactionState = state;
      for (const resolveAttempt of resolveAttempts) {
        const attempt = applyResultsPresentationNamedTransportAttempt({
          state: transactionState,
          resolveAttempt,
        });
        attempts.push(attempt);
        if (!attempt.didApply || attempt.nextState == null) {
          break;
        }
        transactionState = attempt.nextState;
      }
      return applyResolvedTransaction(attempts);
    },
    applyAttempt: (resolveAttempt) =>
      applyResolvedAttempt(
        applyResultsPresentationNamedTransportAttempt({
          state,
          resolveAttempt,
        })
      ),
  };
};
