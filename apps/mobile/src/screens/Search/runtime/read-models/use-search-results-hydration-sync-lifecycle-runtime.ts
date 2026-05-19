import React from 'react';

import type { PhaseBMaterializer } from '../scheduler/phase-b-materializer';
import { logPerfScenarioStackAttribution } from '../../../../perf/perf-scenario-attribution';

export const useSearchResultsHydrationSyncLifecycleRuntime = ({
  resultsHydrationKey,
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
  resultsHydrationKey: string | null;
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
      resultsHydrationKey != null &&
      resultsHydrationKey === hydratedResultsKey &&
      activeOverlayKey === 'search';
    if (hasAlreadySettledHydrationKey) {
      if (settledHydrationKeyRef.current !== resultsHydrationKey) {
        settledHydrationKeyRef.current = resultsHydrationKey;
        onFinalizeRowsReleaseReady();
        logPerfScenarioStackAttribution({
          owner: 'results_hydration_sync_lifecycle_effect',
          path: `settled_reuse:${resultsHydrationKey}`,
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
      path: `pending:${resultsHydrationKey ?? 'null'}|hydrated:${
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
      pendingHydrationKey: resultsHydrationKey,
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
    resultsHydrationKey,
    shouldResetHydrationCommit,
  ]);
};
