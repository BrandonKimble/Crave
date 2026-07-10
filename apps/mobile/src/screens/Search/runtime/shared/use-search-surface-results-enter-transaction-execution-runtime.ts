import React from 'react';

import {
  getActivePerfScenarioSearchThisAreaSubmitId,
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import { resolveSearchSurfaceResultsSheetTargetSnap } from './results-presentation-shell-transaction-intent';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';
import { resolveSearchSubmitEntryMotion } from './search-submit-entry-surface-contract';
import type {
  ResultsSurfaceEnterTransactionExecutor,
  UseResultsSurfaceEnterTransactionExecutionRuntimeArgs,
} from './search-surface-results-transaction-execution-runtime-contract';
import { runResultsSheetSnapWhenLaneAllows } from './results-sheet-snap-stage-gate';
import { useAppRouteSceneRuntime } from '../../../../navigation/runtime/AppRouteSceneRuntimeProvider';

export const useResultsSurfaceEnterTransactionExecutionRuntime = ({
  resultsRuntimeOwner,
  resultsPresentationAuthority,
  prepareSharedSheetForSearchPresentation,
  setDisplayQueryOverride,
}: UseResultsSurfaceEnterTransactionExecutionRuntimeArgs): ResultsSurfaceEnterTransactionExecutor => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const pendingSnapDisposeRef = React.useRef<(() => void) | null>(null);
  React.useEffect(
    () => () => {
      pendingSnapDisposeRef.current?.();
      pendingSnapDisposeRef.current = null;
    },
    []
  );
  return React.useCallback(
    ({
      snapshot,
      displayQueryOverride,
      preserveSheetState = false,
      shouldPrepareShortcutSheetTransition = false,
      entrySurface,
    }) => {
      const targetSnap = resolveSearchSurfaceResultsSheetTargetSnap(
        snapshot.kind,
        preserveSheetState
      );
      const entryMotion = resolveSearchSubmitEntryMotion({ entrySurface, preserveSheetState });
      setDisplayQueryOverride(displayQueryOverride ?? '');
      const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
      if (
        snapshot.mutationKind === 'shortcut_rerun' &&
        isPerfScenarioAttributionActive(scenarioConfig)
      ) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'shortcut_submit_press_up_contract',
          coverState: snapshot.coverState,
          loadingStateVisible: true,
          queryPopulated: (displayQueryOverride ?? '').trim().length > 0,
          resultSheetBeginsSlidingUp: targetSnap != null,
          searchBarText: displayQueryOverride ?? '',
          shortcutButtonsFadeOutRequested: shouldPrepareShortcutSheetTransition,
          targetSnap,
          transactionId: snapshot.transactionId,
        });
      }
      if (
        snapshot.mutationKind === 'search_this_area' &&
        isPerfScenarioAttributionActive(scenarioConfig)
      ) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'search_this_area_presentation_intent_contract',
          transactionId: snapshot.transactionId,
          coverState: snapshot.coverState,
          preserveSheetState,
          targetSnap,
          resultSheetBeginsSlidingUp: false,
          loadingStateVisible: true,
          queryPopulated: (displayQueryOverride ?? '').trim().length > 0,
          mutationKind: snapshot.mutationKind,
          searchThisAreaSubmitId: getActivePerfScenarioSearchThisAreaSubmitId(),
        });
      }
      if (targetSnap != null) {
        // S-C.4 item 3b: the manual nav 'hide' command is gone — the nav-visual runtime
        // DERIVES the hide from the surface visual policy this same transaction flips
        // (typed submits are already hidden by the suggestion-surface arm and hand off).
        prepareSharedSheetForSearchPresentation?.();
      }
      resultsRuntimeOwner.cancelPresentationIntent();
      // A newer enter supersedes any reveal snap still deferred behind a prior visible
      // window — cancel the stale pending snap so we never replay an outdated target.
      pendingSnapDisposeRef.current?.();
      pendingSnapDisposeRef.current = null;
      if (targetSnap != null) {
        // Cluster 6 chrome lane: stage the reveal-coupled sheet snap out of the visible
        // reveal/dismiss opacity window (allowSheetSnap === false). In the common case the
        // stage is idle/settled and this fires immediately; if a prior presentation is still
        // mid-window it is deferred until the phase allows it instead of co-firing.
        pendingSnapDisposeRef.current = runResultsSheetSnapWhenLaneAllows(
          resultsPresentationAuthority,
          () => {
            routeSceneRuntime.routeSearchCommandActions.openAppSearchRouteResults({
              snap: targetSnap,
              mode: entryMotion === 'instant_behind_search_mode' ? 'instant' : undefined,
              // Phase 2 — link the redraw transactionId (which the readiness gate
              // marks carry) to the settleToken minted by this switch, so the
              // collector can drive the 'content' plane to completion on real paint.
              contentReadinessTransactionId: snapshot.transactionId,
            });
          },
          `enter:${snapshot.mutationKind}`
        );
      }
      resultsRuntimeOwner.stageSearchSurfaceResultsTransaction(snapshot);
      getSearchSurfaceRuntime().markRedrawSheetReady(snapshot.transactionId);
      return snapshot.transactionId;
    },
    [
      prepareSharedSheetForSearchPresentation,
      resultsPresentationAuthority,
      resultsRuntimeOwner,
      routeSceneRuntime.routeSearchCommandActions,
      setDisplayQueryOverride,
    ]
  );
};
