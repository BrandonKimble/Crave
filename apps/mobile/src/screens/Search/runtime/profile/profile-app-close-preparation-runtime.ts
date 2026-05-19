import React from 'react';

import { resolveProfileCloseHydrationCommitRequest } from '../../../../navigation/runtime/app-route-profile-app-execution-normalizer';
import type { ResultsPresentationSurfaceAuthority } from '../shared/results-presentation-surface-authority';

export type PhaseBMaterializerLike = {
  commitHydrationImmediately: (input: {
    operationId: string;
    nextHydrationKey: string;
    commitHydrationKey: (nextHydrationKey: string) => void;
  }) => void;
};

export type ProfileAppCloseExecutionArgs = {
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
  hydrationOperationId: string | null;
  phaseBMaterializerRef: React.MutableRefObject<PhaseBMaterializerLike>;
  clearSearchAfterProfileDismiss: () => void;
};

export type ProfileAppClosePreparationRuntime = {
  prepareForProfileClose: () => void;
};

type UseProfileAppClosePreparationRuntimeArgs = {
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  closeExecutionArgs: ProfileAppCloseExecutionArgs;
};

export const useProfileAppClosePreparationRuntime = ({
  resultsPresentationSurfaceAuthority,
  closeExecutionArgs,
}: UseProfileAppClosePreparationRuntimeArgs): ProfileAppClosePreparationRuntime => {
  const { pendingMarkerOpenAnimationFrameRef, hydrationOperationId, phaseBMaterializerRef } =
    closeExecutionArgs;

  const prepareForProfileClose = React.useCallback(() => {
    const pendingFrame = pendingMarkerOpenAnimationFrameRef.current;
    if (pendingFrame != null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingFrame);
      }
      pendingMarkerOpenAnimationFrameRef.current = null;
    }

    const surfaceSnapshot = resultsPresentationSurfaceAuthority.getSnapshot();
    const hydrationCommitRequest = resolveProfileCloseHydrationCommitRequest({
      resultsHydrationKey: surfaceSnapshot.resultsHydrationKey,
      hydratedResultsKey: surfaceSnapshot.hydratedResultsKey,
      hydrationOperationId,
    });
    if (!hydrationCommitRequest) {
      return;
    }

    phaseBMaterializerRef.current.commitHydrationImmediately({
      operationId: hydrationCommitRequest.operationId,
      nextHydrationKey: hydrationCommitRequest.nextHydrationKey,
      commitHydrationKey: (nextHydrationKey) => {
        resultsPresentationSurfaceAuthority.publish(
          {
            hydratedResultsKey: nextHydrationKey,
          },
          'profile_close_preparation'
        );
      },
    });
  }, [
    hydrationOperationId,
    pendingMarkerOpenAnimationFrameRef,
    phaseBMaterializerRef,
    resultsPresentationSurfaceAuthority,
  ]);

  return React.useMemo<ProfileAppClosePreparationRuntime>(
    () => ({
      prepareForProfileClose,
    }),
    [prepareForProfileClose]
  );
};
