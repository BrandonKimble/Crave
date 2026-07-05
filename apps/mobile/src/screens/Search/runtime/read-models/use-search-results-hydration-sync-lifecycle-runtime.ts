import React from 'react';

import type { PhaseBMaterializer } from '../scheduler/phase-b-materializer';
import { logPerfScenarioStackAttribution } from '../../../../perf/perf-scenario-attribution';

export const useSearchResultsHydrationSyncLifecycleRuntime = ({
  resultsIdentityKey,
  hydratedResultsKey,
  activeOverlayKey,
  shouldResetHydrationCommit,
  phaseBMaterializerRef,
  resolveOperationId,
  commitHydrationKey,
  canCommitHydrationKey,
  canFinalizeRowsRelease,
  onFinalizeRowsReleaseReady,
}: {
  resultsIdentityKey: string | null;
  hydratedResultsKey: string | null;
  activeOverlayKey: string;
  shouldResetHydrationCommit: boolean;
  phaseBMaterializerRef: React.MutableRefObject<PhaseBMaterializer>;
  resolveOperationId: () => string;
  commitHydrationKey: (nextHydrationKey: string | null) => void;
  canCommitHydrationKey?: () => boolean;
  canFinalizeRowsRelease?: () => boolean;
  onFinalizeRowsReleaseReady: () => void;
}) => {
  const settledHydrationKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const hasAlreadySettledHydrationKey =
      !shouldResetHydrationCommit &&
      resultsIdentityKey != null &&
      resultsIdentityKey === hydratedResultsKey &&
      activeOverlayKey === 'search';
    if (hasAlreadySettledHydrationKey) {
      if (settledHydrationKeyRef.current !== resultsIdentityKey) {
        settledHydrationKeyRef.current = resultsIdentityKey;
        onFinalizeRowsReleaseReady();
        logPerfScenarioStackAttribution({
          owner: 'results_hydration_sync_lifecycle_effect',
          path: `settled_reuse:${resultsIdentityKey}`,
          details: {
            activeOverlayKey,
          },
        });
      }
      return undefined;
    }
    settledHydrationKeyRef.current = null;
    logPerfScenarioStackAttribution({
      owner: 'results_hydration_sync_lifecycle_effect',
      path: `pending:${resultsIdentityKey ?? 'null'}|hydrated:${
        hydratedResultsKey ?? 'null'
      }|reset:${shouldResetHydrationCommit ? 'true' : 'false'}`,
      details: {
        activeOverlayKey,
      },
    });
    if (shouldResetHydrationCommit) {
      phaseBMaterializerRef.current.resetHydrationCommit();
      return () => {
        phaseBMaterializerRef.current.resetHydrationCommit();
      };
    }
    return phaseBMaterializerRef.current.syncHydrationCommit({
      operationId: resolveOperationId(),
      pendingHydrationKey: resultsIdentityKey,
      hydratedHydrationKey: hydratedResultsKey,
      activeOverlayKey,
      commitHydrationKey,
      canCommitHydrationKey,
      canFinalizeRowsRelease,
      onFinalizeRowsReleaseReady,
    });
  }, [
    activeOverlayKey,
    canCommitHydrationKey,
    canFinalizeRowsRelease,
    commitHydrationKey,
    hydratedResultsKey,
    onFinalizeRowsReleaseReady,
    phaseBMaterializerRef,
    resolveOperationId,
    resultsIdentityKey,
    shouldResetHydrationCommit,
  ]);
};
