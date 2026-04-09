import type { ResultsPresentationTransportState } from './results-presentation-runtime-contract';

export type ResultsPresentationNamedLog = {
  label: string;
  data: Record<string, unknown>;
};

export type ResultsPresentationNamedTransportAttempt = {
  nextState: ResultsPresentationTransportState | null;
  appliedLog: ResultsPresentationNamedLog | null;
  blockedLog?: ResultsPresentationNamedLog | null;
};

export type AppliedResultsPresentationRuntimeAttempt = {
  nextState: ResultsPresentationTransportState | null;
  appliedLog: ResultsPresentationNamedLog | null;
  blockedLog: ResultsPresentationNamedLog | null;
  didApply: boolean;
  completedIntentId?: string | null;
};

export const resolveActiveResultsPresentationTransportState = (
  state: ResultsPresentationTransportState,
  options: {
    requestKey: string;
    direction: 'enter' | 'exit';
  }
): ResultsPresentationTransportState | null => {
  const { requestKey, direction } = options;
  if (
    state.transactionId == null ||
    state.transactionId !== requestKey ||
    state.executionStage === 'settled' ||
    state.executionStage === 'idle'
  ) {
    return null;
  }

  if (direction === 'enter') {
    return state.snapshotKind === 'results_exit' ? null : state;
  }

  return state.snapshotKind === 'results_exit' ? state : null;
};

export const applyResultsPresentationNamedTransportAttempt = ({
  state,
  resolveAttempt,
}: {
  state: ResultsPresentationTransportState;
  resolveAttempt: (
    draft: ResultsPresentationTransportState
  ) => ResultsPresentationNamedTransportAttempt;
}): AppliedResultsPresentationRuntimeAttempt => {
  const draft: ResultsPresentationTransportState = { ...state };
  const attempt = resolveAttempt(draft);

  if (attempt.nextState == null) {
    return {
      nextState: null,
      appliedLog: attempt.appliedLog,
      blockedLog: attempt.blockedLog ?? null,
      didApply: false,
    };
  }

  Object.assign(draft, attempt.nextState);

  return {
    nextState: draft,
    appliedLog: attempt.appliedLog,
    blockedLog: attempt.blockedLog ?? null,
    didApply: true,
  };
};
