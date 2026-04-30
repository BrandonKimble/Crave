import React from 'react';

import type { PhaseBMaterializer } from '../scheduler/phase-b-materializer';

export const useSearchResultsHydrationSyncLifecycleRuntime = ({
  resultsHydrationKey,
  hydratedResultsKey,
  activeOverlayKey,
  shouldResetHydrationCommit,
  phaseBMaterializerRef,
  resolveOperationId,
  commitHydrationKey,
  onFinalizeRowsReleaseReady,
}: {
  resultsHydrationKey: string | null;
  hydratedResultsKey: string | null;
  activeOverlayKey: string;
  shouldResetHydrationCommit: boolean;
  phaseBMaterializerRef: React.MutableRefObject<PhaseBMaterializer>;
  resolveOperationId: () => string;
  commitHydrationKey: (nextHydrationKey: string | null) => void;
  onFinalizeRowsReleaseReady: () => void;
}) => {
  React.useEffect(() => {
    if (shouldResetHydrationCommit) {
      phaseBMaterializerRef.current.resetHydrationCommit();
      return () => {
        phaseBMaterializerRef.current.resetHydrationCommit();
      };
    }
    return phaseBMaterializerRef.current.syncHydrationCommit({
      operationId: resolveOperationId(),
      pendingHydrationKey: resultsHydrationKey,
      hydratedHydrationKey: hydratedResultsKey,
      activeOverlayKey,
      commitHydrationKey,
      onFinalizeRowsReleaseReady,
    });
  }, [
    activeOverlayKey,
    commitHydrationKey,
    hydratedResultsKey,
    onFinalizeRowsReleaseReady,
    phaseBMaterializerRef,
    resolveOperationId,
    resultsHydrationKey,
    shouldResetHydrationCommit,
  ]);
};
