import type { ResultsPresentationTransportState } from './results-presentation-runtime-contract';
import type { ResultsPresentationNamedTransportAttempt } from './results-presentation-runtime-machine-transport-primitives';
import { resolveActiveResultsPresentationTransportState } from './results-presentation-runtime-machine-transport-primitives';

export const resolveExitStartedResultsPresentationTransportAttempt = (
  state: ResultsPresentationTransportState,
  payload: {
    requestKey: string;
    startedAtMs: number;
  }
): ResultsPresentationNamedTransportAttempt => {
  const activeExecution = resolveActiveResultsPresentationTransportState(state, {
    requestKey: payload.requestKey,
    direction: 'exit',
  });

  const nextState =
    activeExecution == null
      ? null
      : {
          ...state,
          executionStage: 'exit_executing' as const,
          startToken: payload.startedAtMs,
        };

  return {
    nextState,
    appliedLog:
      nextState == null
        ? null
        : {
            label: 'markExitStarted',
            data: {
              requestKey: payload.requestKey,
              startedAtMs: payload.startedAtMs,
            },
          },
    blockedLog:
      nextState != null
        ? null
        : {
            label: 'markExitStarted:skip',
            data: {
              requestKey: payload.requestKey,
              activeExitRequestKey:
                state.snapshotKind === 'results_exit' ? state.transactionId : null,
              activeExecutionStage: activeExecution?.executionStage ?? state.executionStage,
            },
          },
  };
};

export const resolveExitSettledResultsPresentationTransportAttempt = (
  state: ResultsPresentationTransportState,
  payload: {
    requestKey: string;
    settledAtMs: number;
  }
): ResultsPresentationNamedTransportAttempt => {
  const activeExecution = resolveActiveResultsPresentationTransportState(state, {
    requestKey: payload.requestKey,
    direction: 'exit',
  });

  const nextState =
    activeExecution == null
      ? null
      : {
          ...state,
          executionStage: 'settled' as const,
          transactionId: null,
          coverState: 'hidden' as const,
        };

  return {
    nextState,
    appliedLog:
      nextState == null
        ? null
        : {
            label: 'markExitSettled',
            data: {
              requestKey: payload.requestKey,
              settledAtMs: payload.settledAtMs,
            },
          },
    blockedLog:
      nextState != null
        ? null
        : {
            label: 'markExitSettled:skip',
            data: {
              requestKey: payload.requestKey,
              activeExitRequestKey:
                state.snapshotKind === 'results_exit' ? state.transactionId : null,
              activeExecutionStage: activeExecution?.executionStage ?? state.executionStage,
            },
          },
  };
};
