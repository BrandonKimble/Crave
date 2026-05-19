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
