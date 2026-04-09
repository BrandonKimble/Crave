import React from 'react';

import type { SearchRuntimeBus } from '../shared/search-runtime-bus';

export type PhaseBMaterializerLike = {
  commitHydrationImmediately: (input: {
    operationId: string;
    nextHydrationKey: string;
    commitHydrationKey: (nextHydrationKey: string) => void;
  }) => void;
};

export type ProfileAppCloseExecutionArgs = {
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
  resultsHydrationKey: string | null;
  hydratedResultsKey: string | null;
  hydrationOperationId: string | null;
  phaseBMaterializerRef: React.MutableRefObject<PhaseBMaterializerLike>;
  clearSearchAfterProfileDismiss: () => void;
};

export type ProfileAppClosePreparationRuntime = {
  prepareForProfileClose: () => void;
};

type UseProfileAppClosePreparationRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  closeExecutionArgs: ProfileAppCloseExecutionArgs;
};

export const useProfileAppClosePreparationRuntime = ({
  searchRuntimeBus,
  closeExecutionArgs,
}: UseProfileAppClosePreparationRuntimeArgs): ProfileAppClosePreparationRuntime => {
  const {
    pendingMarkerOpenAnimationFrameRef,
    resultsHydrationKey,
    hydratedResultsKey,
    hydrationOperationId,
    phaseBMaterializerRef,
  } = closeExecutionArgs;

  const prepareForProfileClose = React.useCallback(() => {
    const pendingFrame = pendingMarkerOpenAnimationFrameRef.current;
    if (pendingFrame != null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingFrame);
      }
      pendingMarkerOpenAnimationFrameRef.current = null;
    }

    if (!resultsHydrationKey || resultsHydrationKey === hydratedResultsKey) {
      return;
    }

    phaseBMaterializerRef.current.commitHydrationImmediately({
      operationId: hydrationOperationId ?? 'profile-close-hydration',
      nextHydrationKey: resultsHydrationKey,
      commitHydrationKey: (nextHydrationKey) => {
        searchRuntimeBus.publish({
          hydratedResultsKey: nextHydrationKey,
        });
      },
    });
  }, [
    hydratedResultsKey,
    hydrationOperationId,
    pendingMarkerOpenAnimationFrameRef,
    phaseBMaterializerRef,
    resultsHydrationKey,
    searchRuntimeBus,
  ]);

  return React.useMemo<ProfileAppClosePreparationRuntime>(
    () => ({
      prepareForProfileClose,
    }),
    [prepareForProfileClose]
  );
};
