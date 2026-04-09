import type { ResultsPresentationTransportState } from './results-presentation-runtime-contract';
import type {
  AppliedResultsPresentationRuntimeAttempt,
  ResultsPresentationNamedTransportAttempt,
} from './results-presentation-runtime-machine-transport-primitives';
import { resolveActiveResultsPresentationTransportState } from './results-presentation-runtime-machine-transport-primitives';

export const resolveEnterStartedResultsPresentationTransportAttempt = (
  state: ResultsPresentationTransportState,
  options: {
    requestKey: string;
    executionBatch: ResultsPresentationTransportState['executionBatch'];
  }
): ResultsPresentationNamedTransportAttempt => {
  const activeExecution = resolveActiveResultsPresentationTransportState(state, {
    requestKey: options.requestKey,
    direction: 'enter',
  });

  const nextState =
    activeExecution?.executionStage !== 'enter_executing'
      ? null
      : {
          ...state,
          coverState: 'hidden' as const,
          executionBatch: options.executionBatch ?? state.executionBatch,
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
