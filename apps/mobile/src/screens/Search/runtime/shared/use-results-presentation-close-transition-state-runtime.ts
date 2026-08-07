import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

// LEG-4 NOTE (plans/toggle-strip-rebuild-ledger.md §Leg 4): the close-SEARCH-CLEANUP
// runtime that used to be composed here was DELETED as dead code. Its schedule entry
// point lost its last caller in 9fa642d7 (the S-C.5 close rebuild): every dismissal
// shape now reaches `clearSearchState` — a strict superset of the old cleanup body —
// either directly (motionless pop exits) or via `finalizeCloseSearch` (terminal home
// dismissals). A cleanup hook that can never fire is a latent-bug factory, not a
// safety net. (F5303: the comment moved here from the deleted
// use-results-presentation-close-transition-runtime wrapper, which composed it.)

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import {
  getPerfScenarioWorkNow,
  logPerfScenarioWorkSpan,
} from '../../../../perf/perf-scenario-work-span';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type { OverlayKey } from '../../../../overlays/types';
import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { SearchCloseTransitionState } from './results-presentation-shell-contract';
import type { ResultsCloseTransitionActions } from './results-presentation-shell-runtime-contract';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import { createSearchCloseTransitionState } from './results-presentation-shell-close-transition-state';
import {
  applySearchCloseCollapsedReached,
  applySearchCloseMapExitSettledForTelemetry,
  applySearchCloseSheetSettled,
} from './results-presentation-shell-close-transition-state';
import {
  getSearchSurfaceRuntime,
  selectSearchSurfaceVisualPolicy,
  type SearchSurfaceVisualPolicySnapshot,
  useSearchSurfaceRuntimeSelector,
} from '../surface/search-surface-runtime';

type UseResultsPresentationCloseTransitionStateRuntimeArgs = {
  clearSearchState: SearchClearOwner['clearSearchState'];
  shellLocalState: ResultsPresentationShellLocalState;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
};

type ResultsPresentationCloseTransitionStateRuntime = {
  closeTransitionActions: ResultsCloseTransitionActions;
  beginCloseTransition: (
    closeIntentId: string,
    options?: {
      outgoingSheetSceneKey?: OverlayKey | null;
    }
  ) => void;
  setPendingCloseIntentId: (intentId: string | null) => void;
  matchesPendingCloseIntentId: (intentId: string) => boolean;
};

/**
 * F6002: A SELECTOR'S PROJECTED SHAPE IS ITS SUBSCRIPTION CONTRACT.
 *
 * Every field here is a promise to re-render when it moves, so a field nobody
 * reads is a promise to do work for nothing. This carried six fields for three
 * values: `pollBodyReady`/`pollHeaderReady`/`pollHostReady` were written beside
 * their own `isDockedScene*` aliases and read by nobody but the comparator,
 * where they compared against those aliases — three conjuncts that could never
 * change the answer. `dismissBottomBoundaryReached` was worse: unread by every
 * consumer but able to move independently, so it defeated the equality gate,
 * notified the subscriber and re-ran the release effect mid-dismissal, whose
 * entire outcome was `emitReleaseReadyBottomHandoffTelemetry` early-returning on
 * `releasedCloseIntentIdRef`. The type now names exactly what is read; a field
 * added back to the Pick without a reader is flagged at the builder literal.
 */
type ReleaseReadyCloseSnapshot = Pick<
  SearchSurfaceVisualPolicySnapshot,
  'canExposeDockedScene' | 'canReleaseDockedScene' | 'transactionId'
> & {
  isDockedSceneBodyReady: boolean;
  isDockedSceneHeaderReady: boolean;
  isDockedSceneHostReady: boolean;
  isResultsExitCollapsedSettled: boolean;
  isResultsExitMapSettled: boolean;
};

const selectReleaseReadyCloseSnapshot = (
  policy: SearchSurfaceVisualPolicySnapshot,
  closeTransitionState: SearchCloseTransitionState
): ReleaseReadyCloseSnapshot | null => {
  if (policy.phase !== 'results_dismissing' || !policy.canReleaseDockedScene) {
    return null;
  }
  const isSameCloseIntent =
    closeTransitionState != null && closeTransitionState.closeIntentId === policy.transactionId;
  return {
    isDockedSceneBodyReady: policy.pollBodyReady,
    isDockedSceneHeaderReady: policy.pollHeaderReady,
    canExposeDockedScene: policy.canExposeDockedScene,
    canReleaseDockedScene: policy.canReleaseDockedScene,
    isDockedSceneHostReady: policy.pollHostReady,
    isResultsExitCollapsedSettled: isSameCloseIntent && closeTransitionState.sheetCollapsedSettled,
    isResultsExitMapSettled: isSameCloseIntent && closeTransitionState.mapExitSettled,
    transactionId: policy.transactionId,
  };
};

const areReleaseReadyCloseSnapshotsEqual = (
  left: ReleaseReadyCloseSnapshot | null,
  right: ReleaseReadyCloseSnapshot | null
): boolean =>
  left?.transactionId === right?.transactionId &&
  left?.isDockedSceneBodyReady === right?.isDockedSceneBodyReady &&
  left?.isDockedSceneHeaderReady === right?.isDockedSceneHeaderReady &&
  left?.canExposeDockedScene === right?.canExposeDockedScene &&
  left?.canReleaseDockedScene === right?.canReleaseDockedScene &&
  left?.isDockedSceneHostReady === right?.isDockedSceneHostReady &&
  left?.isResultsExitCollapsedSettled === right?.isResultsExitCollapsedSettled &&
  left?.isResultsExitMapSettled === right?.isResultsExitMapSettled;

export const useResultsPresentationCloseTransitionStateRuntime = ({
  clearSearchState,
  shellLocalState,
  routeSceneVisibilityPolicyRuntime,
}: UseResultsPresentationCloseTransitionStateRuntimeArgs): ResultsPresentationCloseTransitionStateRuntime => {
  // ─── Intent phase (S-C.5 close-chain L-merge, 2026-07-10): formerly its own hook file.
  // Three refs + the begin/reset pair — one lifecycle, one file with the marks it gates.
  const pendingCloseIntentIdRef = React.useRef<string | null>(null);
  const activeCloseIntentIdRef = React.useRef<string | null>(null);
  const finalizedCloseIntentIdRef = React.useRef<string | null>(null);

  const setPendingCloseIntentId = React.useCallback((intentId: string | null) => {
    pendingCloseIntentIdRef.current = intentId;
  }, []);

  const matchesPendingCloseIntentId = React.useCallback((intentId: string) => {
    return pendingCloseIntentIdRef.current === intentId;
  }, []);

  const resetCloseTransition = React.useCallback(() => {
    activeCloseIntentIdRef.current = null;
    finalizedCloseIntentIdRef.current = null;
    routeSceneVisibilityPolicyRuntime.updateCloseTransitionActive(false);
    shellLocalState.setSearchCloseTransitionState(null);
  }, [routeSceneVisibilityPolicyRuntime, shellLocalState]);

  const beginCloseTransitionIntent = React.useCallback(
    (closeIntentId: string) => {
      if (activeCloseIntentIdRef.current === closeIntentId) {
        return;
      }

      activeCloseIntentIdRef.current = closeIntentId;
      finalizedCloseIntentIdRef.current = null;
      // S-C.4 item 3 step 2: the old ARM (origin capture into the store ledger) is gone —
      // the terminal dance only serves HOME dismissals now (children/non-search roots pop
      // via entry origins in the dismiss selector), and the home restore rides the dismiss
      // verb's ONE terminalDismiss switch. Nothing to arm, nothing to flush at finalize.
      shellLocalState.setHoldDockedLane(false);
      shellLocalState.setBackdropTarget('default');
      shellLocalState.setInputMode('idle');
      routeSceneVisibilityPolicyRuntime.updateCloseTransitionActive(true);
      shellLocalState.setSearchCloseTransitionState(
        createSearchCloseTransitionState(closeIntentId)
      );
    },
    [routeSceneVisibilityPolicyRuntime, shellLocalState]
  );

  const getActiveCloseIntentId = React.useCallback(() => {
    return activeCloseIntentIdRef.current;
  }, []);

  // ─── Finalize phase (same merge): clear-search + dismiss handoff + reset, batched.
  const finalizeCloseSearch = React.useCallback(
    (intentId: string) => {
      if (pendingCloseIntentIdRef.current !== intentId) {
        return false;
      }

      clearSearchState({
        skipPostSearchRestore: true,
        preserveForegroundEditing: shellLocalState.inputMode === 'editing',
      });
      pendingCloseIntentIdRef.current = null;
      return true;
    },
    [clearSearchState, shellLocalState.inputMode]
  );

  const finalizeCloseTransition = React.useCallback(
    (closeIntentId: string) => {
      if (finalizedCloseIntentIdRef.current === closeIntentId) {
        return;
      }

      finalizedCloseIntentIdRef.current = closeIntentId;
      unstable_batchedUpdates(() => {
        const didFinalizeCloseSearch = finalizeCloseSearch(closeIntentId);
        if (!didFinalizeCloseSearch) {
          resetCloseTransition();
          return;
        }
        getSearchSurfaceRuntime().completeDismissHandoff(closeIntentId);
        // S-C.4 item 3 step 2: NO restore emission here — the home landing already rode the
        // dismiss verb's ONE terminalDismiss switch (targetSceneKey 'search', docked
        // mode). The old flush/default pair (and the ledger they read) is deleted; children
        // and non-search roots never reach this dance (the dismiss selector pops them).
        resetCloseTransition();
      });
    },
    [finalizeCloseSearch, resetCloseTransition]
  );

  const boundaryCloseIntentIdRef = React.useRef<string | null>(null);
  const collapsedBoundaryReachedAtMsRef = React.useRef<number | null>(null);
  const releasedCloseIntentIdRef = React.useRef<string | null>(null);
  const finalizeReleaseReadyCloseTransition = React.useCallback(
    (closeIntentId: string) => {
      if (getActiveCloseIntentId() !== closeIntentId) {
        return;
      }
      finalizeCloseTransition(closeIntentId);
    },
    [finalizeCloseTransition, getActiveCloseIntentId]
  );

  const emitReleaseReadyBottomHandoffTelemetry = React.useCallback(
    (
      releaseReadyCloseSnapshot: ReleaseReadyCloseSnapshot,
      options?: { releasedAtCollapsedBoundary?: boolean }
    ) => {
      const releaseReadyCloseIntentId = releaseReadyCloseSnapshot.transactionId;
      if (releaseReadyCloseIntentId == null) {
        return false;
      }
      if (getActiveCloseIntentId() !== releaseReadyCloseIntentId) {
        return false;
      }
      if (releasedCloseIntentIdRef.current === releaseReadyCloseIntentId) {
        return true;
      }

      releasedCloseIntentIdRef.current = releaseReadyCloseIntentId;
      shellLocalState.setBackdropTarget('default');
      shellLocalState.setInputMode('idle');
      const collapsedBoundaryReachedAtMs = collapsedBoundaryReachedAtMsRef.current;
      const didReleaseAtCollapsedBoundary =
        options?.releasedAtCollapsedBoundary === true ||
        (collapsedBoundaryReachedAtMs != null &&
          releaseReadyCloseSnapshot.isDockedSceneBodyReady &&
          releaseReadyCloseSnapshot.isDockedSceneHeaderReady &&
          releaseReadyCloseSnapshot.canExposeDockedScene &&
          releaseReadyCloseSnapshot.canReleaseDockedScene &&
          releaseReadyCloseSnapshot.isDockedSceneHostReady);
      const releasedAtMs =
        didReleaseAtCollapsedBoundary && collapsedBoundaryReachedAtMs != null
          ? collapsedBoundaryReachedAtMs
          : Date.now();
      const releaseDelayAfterCollapsedBoundaryMs =
        collapsedBoundaryReachedAtMs == null
          ? null
          : Math.max(0, releasedAtMs - collapsedBoundaryReachedAtMs);
      const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        const telemetryStartedAtMs = getPerfScenarioWorkNow();
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'results_dismiss_bottom_snap_handoff_contract',
          isDockedSceneBodyReady: releaseReadyCloseSnapshot.isDockedSceneBodyReady,
          isDockedSceneHeaderReady: releaseReadyCloseSnapshot.isDockedSceneHeaderReady,
          canExposeDockedScene: releaseReadyCloseSnapshot.canExposeDockedScene,
          canReleaseDockedScene: releaseReadyCloseSnapshot.canReleaseDockedScene,
          boundaryTrigger: 'collapsed_motion_plane_boundary',
          isDockedSceneHostReady: releaseReadyCloseSnapshot.isDockedSceneHostReady,
          isResultsExitCollapsedSettled: releaseReadyCloseSnapshot.isResultsExitCollapsedSettled,
          isResultsExitMapSettled: releaseReadyCloseSnapshot.isResultsExitMapSettled,
          dockedSceneSwitchAtBottomSnap: true,
          releaseDelayAfterCollapsedBoundaryMs,
          releasedAtCollapsedBoundary:
            didReleaseAtCollapsedBoundary ||
            (releaseDelayAfterCollapsedBoundaryMs != null &&
              releaseDelayAfterCollapsedBoundaryMs <= 20),
          snap: 'collapsed',
          transactionId: releaseReadyCloseIntentId,
        });
        logPerfScenarioWorkSpan({
          owner: 'results_dismiss_bottom_snap_handoff_log',
          path: releaseReadyCloseIntentId,
          startedAtMs: telemetryStartedAtMs,
          details: {
            releaseDelayAfterCollapsedBoundaryMs,
          },
        });
      }
      return true;
    },
    [getActiveCloseIntentId, shellLocalState]
  );

  const markSearchSheetCloseMapExitSettled = React.useCallback(
    (closeIntentId: string) => {
      shellLocalState.setSearchCloseTransitionState((current) =>
        applySearchCloseMapExitSettledForTelemetry({
          current,
          closeIntentId,
        })
      );
    },
    [shellLocalState]
  );

  const markSearchSheetCloseCollapsedReached = React.useCallback(
    (
      snap: import('../../../../overlays/types').OverlaySheetSnap,
      source: 'motion_plane' = 'motion_plane'
    ) => {
      const activeCloseIntentId = getActiveCloseIntentId() ?? boundaryCloseIntentIdRef.current;
      if (!activeCloseIntentId || snap !== 'collapsed') {
        return;
      }
      collapsedBoundaryReachedAtMsRef.current = Date.now();
      const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'results_dismiss_collapsed_boundary_contract',
          boundaryTrigger: 'collapsed_reached',
          boundarySource: source,
          dockedScenePrepareAtBottomSnap: true,
          dockedSceneSwitchAtBottomSnap: true,
          snap,
          transactionId: activeCloseIntentId,
        });
      }
      getSearchSurfaceRuntime().commitDismissBoundary(activeCloseIntentId);
      shellLocalState.setHoldDockedLane(false);
      // Post-S-C.4 red team (state-runtime smell, adjudicated 2026-07-10): this outside
      // compute reads the RENDER-CAPTURED close state while the setState below uses the
      // functional form — they can diverge if another mark landed between render and this
      // event. SAFE BY MONOTONICITY: every close-state flag only goes false→true, so the
      // captured value under-reports at worst, the release check below can only DELAY the
      // finalize, and the sheet-settled path finalizes anyway. Do not "fix" this with a
      // ref mirror; document > machinery.
      const nextCloseTransitionState = applySearchCloseCollapsedReached({
        current: shellLocalState.searchCloseTransitionState,
        closeIntentId: activeCloseIntentId,
        snap,
      });
      shellLocalState.setSearchCloseTransitionState((current) =>
        applySearchCloseCollapsedReached({
          current,
          closeIntentId: activeCloseIntentId,
          snap,
        })
      );
      const releaseReadyCloseSnapshot = selectReleaseReadyCloseSnapshot(
        selectSearchSurfaceVisualPolicy(getSearchSurfaceRuntime().getSnapshot()),
        nextCloseTransitionState
      );
      if (releaseReadyCloseSnapshot != null) {
        emitReleaseReadyBottomHandoffTelemetry(releaseReadyCloseSnapshot, {
          releasedAtCollapsedBoundary: true,
        });
        finalizeReleaseReadyCloseTransition(activeCloseIntentId);
      }
    },
    [
      emitReleaseReadyBottomHandoffTelemetry,
      finalizeReleaseReadyCloseTransition,
      getActiveCloseIntentId,
      shellLocalState,
    ]
  );

  const markSearchSheetCloseSheetSettled = React.useCallback(
    (snap: import('../../../../overlays/types').OverlaySheetSnap) => {
      const activeCloseIntentId = getActiveCloseIntentId();
      if (!activeCloseIntentId || snap !== 'collapsed') {
        return;
      }
      shellLocalState.setSearchCloseTransitionState((current) =>
        applySearchCloseSheetSettled({
          current,
          closeIntentId: activeCloseIntentId,
          snap,
        })
      );
    },
    [getActiveCloseIntentId, shellLocalState]
  );

  const beginCloseTransition = React.useCallback(
    (
      closeIntentId: string,
      options?: {
        outgoingSheetSceneKey?: OverlayKey | null;
      }
    ) => {
      collapsedBoundaryReachedAtMsRef.current = null;
      releasedCloseIntentIdRef.current = null;
      boundaryCloseIntentIdRef.current = closeIntentId;
      getSearchSurfaceRuntime().armDismissMotion({
        transactionId: closeIntentId,
        // S-C.5 (terminalDismissSource axis deleted): every producer passes the outgoing
        // scene explicitly (derived from the stack fact in beginCloseSearch); 'search' is
        // only the type-level default.
        outgoingSheetSceneKey: options?.outgoingSheetSceneKey ?? 'search',
      });
      beginCloseTransitionIntent(closeIntentId);
    },
    // F6003: `shellLocalState.searchCloseTransitionState` used to sit here and the
    // body never touched it — it changes on every mark during a dismissal, so the
    // callback that STARTS a close transition was re-minted several times per
    // dismissal and invalidated this hook's whole return memo with it.
    // `react-hooks/exhaustive-deps` polices MISSING deps; an extra one is
    // invisible to it, so the lint being green here never carried information.
    [beginCloseTransitionIntent]
  );

  const releaseReadyCloseSnapshot = useSearchSurfaceRuntimeSelector(
    (snapshot) =>
      selectReleaseReadyCloseSnapshot(
        selectSearchSurfaceVisualPolicy(snapshot),
        shellLocalState.searchCloseTransitionState
      ),
    areReleaseReadyCloseSnapshotsEqual
  );

  React.useEffect(() => {
    if (releaseReadyCloseSnapshot == null) {
      return;
    }
    const releaseReadyCloseIntentId = releaseReadyCloseSnapshot.transactionId;
    if (releaseReadyCloseIntentId == null) {
      return;
    }
    emitReleaseReadyBottomHandoffTelemetry(releaseReadyCloseSnapshot);
    // F6001: THIS is the finalize decision — "is this close terminal?" is the
    // question of the owner of the transition, asked where it is acted on. The
    // close-transition-state module used to export a named predicate answering
    // it, whose only reference was a field its one caller discarded; it could
    // not have been right, because terminality also depends on the surface
    // policy (phase + canReleaseDockedScene) that this snapshot carries and
    // that module never sees.
    if (releaseReadyCloseSnapshot.isResultsExitCollapsedSettled) {
      finalizeReleaseReadyCloseTransition(releaseReadyCloseIntentId);
    }
  }, [
    emitReleaseReadyBottomHandoffTelemetry,
    finalizeReleaseReadyCloseTransition,
    releaseReadyCloseSnapshot,
  ]);

  const cancelSearchSheetCloseTransition = React.useCallback(
    (closeIntentId?: string) => {
      const activeCloseIntentId = getActiveCloseIntentId();
      if (
        closeIntentId != null &&
        activeCloseIntentId != null &&
        activeCloseIntentId !== closeIntentId
      ) {
        return;
      }

      resetCloseTransition();
      shellLocalState.setHoldDockedLane(false);
    },
    [getActiveCloseIntentId, resetCloseTransition, shellLocalState]
  );

  const closeTransitionActions = React.useMemo(
    () => ({
      markSearchSheetCloseMapExitSettled,
      markSearchSheetCloseCollapsedReached,
      markSearchSheetCloseSheetSettled,
      cancelSearchSheetCloseTransition,
    }),
    [
      cancelSearchSheetCloseTransition,
      markSearchSheetCloseCollapsedReached,
      markSearchSheetCloseMapExitSettled,
      markSearchSheetCloseSheetSettled,
    ]
  );

  return React.useMemo(
    () => ({
      closeTransitionActions,
      beginCloseTransition,
      setPendingCloseIntentId,
      matchesPendingCloseIntentId,
    }),
    [
      beginCloseTransition,
      closeTransitionActions,
      matchesPendingCloseIntentId,
      setPendingCloseIntentId,
    ]
  );
};
