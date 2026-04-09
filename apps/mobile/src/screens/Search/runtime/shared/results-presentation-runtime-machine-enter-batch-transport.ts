import type { ResultsPresentationTransportState } from './results-presentation-runtime-contract';
import type { ResultsPresentationNamedTransportAttempt } from './results-presentation-runtime-machine-transport-primitives';
import { resolveActiveResultsPresentationTransportState } from './results-presentation-runtime-machine-transport-primitives';

export const resolveEnterMountedHiddenResultsPresentationTransportAttempt = (
  state: ResultsPresentationTransportState,
  options: {
    requestKey: string;
    executionBatch: NonNullable<ResultsPresentationTransportState['executionBatch']>;
  }
): ResultsPresentationNamedTransportAttempt => {
  const activeExecution = resolveActiveResultsPresentationTransportState(state, {
    requestKey: options.requestKey,
    direction: 'enter',
  });

  const nextState =
    activeExecution?.executionStage !== 'enter_pending_mount'
      ? null
      : {
          ...state,
          executionBatch: options.executionBatch,
          executionStage: 'enter_mounted_hidden' as const,
        };

  return {
    nextState,
    appliedLog:
      nextState == null
        ? null
        : {
            label: 'markEnterBatchMountedHidden',
            data: {
              intentId: options.requestKey,
              executionBatchId: options.executionBatch.batchId,
              generationId: options.executionBatch.generationId,
              executionStage: nextState.executionStage,
            },
          },
    blockedLog:
      nextState != null
        ? null
        : {
            label: 'markEnterBatchMountedHidden:skip_request_mismatch',
            data: {
              intentId: options.requestKey,
              executionBatchId: options.executionBatch.batchId,
              generationId: options.executionBatch.generationId,
              activeExecutionStage: activeExecution?.executionStage ?? state.executionStage,
            },
          },
  };
};

export const resolveStartedEnterExecutionBatchResultsPresentationTransportAttempt = (
  state: ResultsPresentationTransportState,
  nowMs: number
): ResultsPresentationNamedTransportAttempt => {
  const nextState =
    state.transactionId == null ||
    state.snapshotKind === 'results_exit' ||
    state.executionStage !== 'enter_mounted_hidden' ||
    state.startToken != null ||
    state.executionBatch == null
      ? null
      : {
          ...state,
          executionStage: 'enter_executing' as const,
          startToken: nowMs,
        };

  return {
    nextState,
    appliedLog:
      nextState == null || nextState.executionBatch == null
        ? null
        : {
            label: 'startEnterExecution',
            data: {
              intentId: nextState.transactionId,
              executionBatchId: nextState.executionBatch.batchId,
              generationId: nextState.executionBatch.generationId,
              enterStartToken: nextState.startToken,
            },
          },
    blockedLog:
      nextState != null
        ? null
        : {
            label: 'tryStartExecutionBatch:blocked',
            data: {
              intentId: state.transactionId,
              activeExecutionBatchId: state.executionBatch?.batchId ?? null,
              activeExecutionBatchGenerationId: state.executionBatch?.generationId ?? null,
              executionStage: state.executionStage,
              coverState: state.coverState,
            },
          },
  };
};
