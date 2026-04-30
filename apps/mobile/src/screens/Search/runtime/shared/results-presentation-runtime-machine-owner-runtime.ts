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
  let state: ResultsPresentationTransportState =
    resolveIdleResultsPresentationTransportState();

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

  publish(resolveResultsPresentationRuntimeState(state));

  return {
    getState: () => state,
    applyResolvedAttempt,
    applyAttempt: (resolveAttempt) =>
      applyResolvedAttempt(
        applyResultsPresentationNamedTransportAttempt({
          state,
          resolveAttempt,
        })
      ),
  };
};
