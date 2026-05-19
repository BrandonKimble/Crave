import type { ResultsPresentationTransportState } from './results-presentation-runtime-contract';
import type {
  AppliedResultsPresentationRuntimeAttempt,
  ResultsPresentationNamedTransportAttempt,
} from './results-presentation-runtime-machine-transport-primitives';
import { resolveActiveResultsPresentationTransportState } from './results-presentation-runtime-machine-transport-primitives';

export const resolveEnterNativeStartRequestedResultsPresentationTransportAttempt = (
  state: ResultsPresentationTransportState,
  options: {
    requestKey: string;
    executionBatch: ResultsPresentationTransportState['executionBatch'];
    startToken: number;
  }
): ResultsPresentationNamedTransportAttempt => {
  const activeExecution = resolveActiveResultsPresentationTransportState(state, {
    requestKey: options.requestKey,
    direction: 'enter',
  });

  const nextState =
    activeExecution?.executionStage !== 'enter_mounted_hidden'
      ? null
      : {
          ...state,
          coverState: 'hidden' as const,
          executionBatch: options.executionBatch ?? state.executionBatch,
          executionStage: 'enter_executing' as const,
          startToken: state.startToken ?? options.startToken,
        };

  return {
    nextState,
    appliedLog:
      nextState == null
        ? null
        : {
            label: 'markEnterNativeStartRequested',
            data: {
              intentId: options.requestKey,
              executionBatchId:
                options.executionBatch?.batchId ?? nextState.executionBatch?.batchId ?? null,
              generationId:
                options.executionBatch?.generationId ??
                nextState.executionBatch?.generationId ??
                null,
              coverState: nextState.coverState,
              executionStage: nextState.executionStage,
              enterStartToken: nextState.startToken,
            },
          },
    blockedLog:
      nextState != null
        ? null
        : {
            label: 'markEnterNativeStartRequested:skip_request_mismatch',
            data: {
              intentId: options.requestKey,
              executionBatchId: options.executionBatch?.batchId ?? null,
              generationId: options.executionBatch?.generationId ?? null,
              activeExecutionStage: activeExecution?.executionStage ?? state.executionStage,
              coverState: state.coverState,
            },
          },
  };
};

export const resolveEnterStartedResultsPresentationTransportAttempt = (
  state: ResultsPresentationTransportState,
  options: {
    requestKey: string;
    executionBatch: ResultsPresentationTransportState['executionBatch'];
    startToken: number;
  }
): ResultsPresentationNamedTransportAttempt => {
  const activeExecution = resolveActiveResultsPresentationTransportState(state, {
    requestKey: options.requestKey,
    direction: 'enter',
  });

  const canRevealCover =
    activeExecution?.executionStage === 'enter_mounted_hidden' ||
    (activeExecution?.executionStage === 'enter_executing' && state.coverState !== 'hidden');
  const nextState =
    !canRevealCover
      ? null
      : {
          ...state,
          coverState: 'hidden' as const,
          executionBatch: options.executionBatch ?? state.executionBatch,
          executionStage: 'enter_executing' as const,
          startToken: options.startToken,
        };

  return {
    nextState,
    appliedLog:
      nextState == null
        ? null
        : {
            label: 'markEnterStarted',
            data: {
              intentId: options.requestKey,
              executionBatchId:
                options.executionBatch?.batchId ?? nextState.executionBatch?.batchId ?? null,
              generationId:
                options.executionBatch?.generationId ??
                nextState.executionBatch?.generationId ??
                null,
              executionStage: nextState.executionStage,
              enterStartToken: nextState.startToken,
            },
          },
    blockedLog:
      nextState != null
        ? null
        : {
            label: 'markEnterStarted:skip_request_mismatch',
            data: {
              intentId: options.requestKey,
              executionBatchId: options.executionBatch?.batchId ?? null,
              generationId: options.executionBatch?.generationId ?? null,
              activeExecutionStage: activeExecution?.executionStage ?? state.executionStage,
              coverState: state.coverState,
            },
          },
  };
};

export const resolveEnterSettledResultsPresentationTransportAttempt = (
  state: ResultsPresentationTransportState,
  options: {
    requestKey: string;
    executionBatch: ResultsPresentationTransportState['executionBatch'];
  }
): AppliedResultsPresentationRuntimeAttempt => {
  const activeExecution = resolveActiveResultsPresentationTransportState(state, {
    requestKey: options.requestKey,
    direction: 'enter',
  });

  const nextState =
    activeExecution?.executionStage !== 'enter_executing'
      ? null
      : {
          ...state,
          executionBatch: options.executionBatch ?? state.executionBatch,
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
            label: 'markEnterBatchSettled',
            data: {
              intentId: options.requestKey,
              executionBatchId:
                options.executionBatch?.batchId ?? nextState.executionBatch?.batchId ?? null,
              generationId:
                options.executionBatch?.generationId ??
                nextState.executionBatch?.generationId ??
                null,
              executionStage: nextState.executionStage,
            },
          },
    completedIntentId: nextState == null ? null : options.requestKey,
    blockedLog:
      nextState != null
        ? null
        : {
            label: 'markEnterBatchSettled:skip_request_mismatch',
            data: {
              intentId: options.requestKey,
              executionBatchId: options.executionBatch?.batchId ?? null,
              generationId: options.executionBatch?.generationId ?? null,
              activeExecutionStage: activeExecution?.executionStage ?? state.executionStage,
            },
          },
    didApply: nextState != null,
  };
};
