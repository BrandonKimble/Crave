import React from 'react';

import type { PhaseBMaterializer } from '../scheduler/phase-b-materializer';
import { logPerfScenarioStackAttribution } from '../../../../perf/perf-scenario-attribution';

export const useSearchResultsHydrationSyncLifecycleRuntime = ({
  resultsIdentityKey,
  hydratedResultsKey,
  activeOverlayKey,
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
      // F4801: this used to carry `|reset:${shouldResetHydrationCommit}` — a field the
      // sole call site pinned to the literal `false`, so every line this instrument will
      // ever print says `reset:false`. Dropped with the flag, F1062-style (the same file
      // records that deletion, fifty lines below) rather than documented in place.
      path: `pending:${resultsIdentityKey ?? 'null'}|hydrated:${hydratedResultsKey ?? 'null'}`,
      details: {
        activeOverlayKey,
      },
    });
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
  ]);
};
