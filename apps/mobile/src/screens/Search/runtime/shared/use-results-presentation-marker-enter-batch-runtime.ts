import React from 'react';

import type {
  ExecutionBatchPayload,
  MarkerEnterSettledPayload,
  ResultsPresentationRuntimeOwner,
} from './results-presentation-runtime-owner-contract';

const toExecutionBatchRef = (payload: ExecutionBatchPayload) => {
  if (payload.executionBatchId == null || payload.frameGenerationId == null) {
    return null;
  }

  return {
    batchId: payload.executionBatchId,
    generationId: payload.frameGenerationId,
  };
};

type ResultsPresentationMarkerEnterBatchRuntime = Pick<
  ResultsPresentationRuntimeOwner,
  'handleExecutionBatchMountedHidden' | 'handleMarkerEnterStarted'
> & {
  acceptMarkerEnterSettled: (payload: MarkerEnterSettledPayload) => boolean;
};

export type UseResultsPresentationMarkerEnterBatchRuntimeArgs = {
  markEnterBatchMountedHidden: (
    requestKey: string,
    executionBatch: {
      batchId: string;
      generationId: string;
    }
  ) => boolean;
  markEnterStarted: (
    requestKey: string,
    executionBatch: { batchId: string; generationId: string } | null
  ) => boolean;
  markEnterBatchSettled: (
    requestKey: string,
    executionBatch: { batchId: string; generationId: string } | null
  ) => boolean;
};

export const useResultsPresentationMarkerEnterBatchRuntime = ({
  markEnterBatchMountedHidden,
  markEnterStarted,
  markEnterBatchSettled,
}: UseResultsPresentationMarkerEnterBatchRuntimeArgs): ResultsPresentationMarkerEnterBatchRuntime => {
  const handleExecutionBatchMountedHidden = React.useCallback(
    (payload: ExecutionBatchPayload) => {
      const executionBatch = toExecutionBatchRef(payload);
      if (executionBatch == null) {
        return;
      }
      markEnterBatchMountedHidden(payload.requestKey, executionBatch);
    },
    [markEnterBatchMountedHidden]
  );

  const handleMarkerEnterStarted = React.useCallback(
    (payload: ExecutionBatchPayload) => {
      const executionBatch = toExecutionBatchRef(payload);
      if (executionBatch == null) {
        return;
      }
      markEnterStarted(payload.requestKey, executionBatch);
    },
    [markEnterStarted]
  );

  const acceptMarkerEnterSettled = React.useCallback(
    (payload: MarkerEnterSettledPayload) => {
      const executionBatch = toExecutionBatchRef(payload);
      if (executionBatch == null) {
        return false;
      }
      return markEnterBatchSettled(payload.requestKey, executionBatch);
    },
    [markEnterBatchSettled]
  );

  return React.useMemo(
    () => ({
      handleExecutionBatchMountedHidden,
      handleMarkerEnterStarted,
      acceptMarkerEnterSettled,
    }),
    [acceptMarkerEnterSettled, handleExecutionBatchMountedHidden, handleMarkerEnterStarted]
  );
};
