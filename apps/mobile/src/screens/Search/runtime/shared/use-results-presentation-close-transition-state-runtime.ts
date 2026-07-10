import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

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
  applySearchCloseMapExitSettled,
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

type ReleaseReadyCloseSnapshot = Pick<
  SearchSurfaceVisualPolicySnapshot,
  | 'canExposePersistentPolls'
  | 'canReleasePersistentPolls'
  | 'dismissBottomBoundaryReached'
  | 'pollBodyReady'
  | 'pollHeaderReady'
  | 'pollHostReady'
  | 'transactionId'
> & {
  arePersistentPollsBodyReady: boolean;
  arePersistentPollsHeaderReady: boolean;
  isPersistentPollHostReady: boolean;
  isResultsExitCollapsedSettled: boolean;
  isResultsExitMapSettled: boolean;
};

const selectReleaseReadyCloseSnapshot = (
  policy: SearchSurfaceVisualPolicySnapshot,
  closeTransitionState: SearchCloseTransitionState
): ReleaseReadyCloseSnapshot | null => {
  if (policy.phase !== 'results_dismissing' || !policy.canReleasePersistentPolls) {
    return null;
  }
  const isSameCloseIntent =
    closeTransitionState != null && closeTransitionState.closeIntentId === policy.transactionId;
  return {
    arePersistentPollsBodyReady: policy.pollBodyReady,
    arePersistentPollsHeaderReady: policy.pollHeaderReady,
    canExposePersistentPolls: policy.canExposePersistentPolls,
    canReleasePersistentPolls: policy.canReleasePersistentPolls,
    dismissBottomBoundaryReached: policy.dismissBottomBoundaryReached,
    isPersistentPollHostReady: policy.pollHostReady,
    isResultsExitCollapsedSettled: isSameCloseIntent && closeTransitionState.sheetCollapsedSettled,
    isResultsExitMapSettled: isSameCloseIntent && closeTransitionState.mapExitSettled,
    pollBodyReady: policy.pollBodyReady,
    pollHeaderReady: policy.pollHeaderReady,
    pollHostReady: policy.pollHostReady,
    transactionId: policy.transactionId,
  };
};

const areReleaseReadyCloseSnapshotsEqual = (
  left: ReleaseReadyCloseSnapshot | null,
  right: ReleaseReadyCloseSnapshot | null
): boolean =>
  left?.transactionId === right?.transactionId &&
  left?.arePersistentPollsBodyReady === right?.arePersistentPollsBodyReady &&
  left?.arePersistentPollsHeaderReady === right?.arePersistentPollsHeaderReady &&
  left?.canExposePersistentPolls === right?.canExposePersistentPolls &&
  left?.canReleasePersistentPolls === right?.canReleasePersistentPolls &&
  left?.dismissBottomBoundaryReached === right?.dismissBottomBoundaryReached &&
  left?.isPersistentPollHostReady === right?.isPersistentPollHostReady &&
  left?.isResultsExitCollapsedSettled === right?.isResultsExitCollapsedSettled &&
  left?.isResultsExitMapSettled === right?.isResultsExitMapSettled &&
  left?.pollBodyReady === right?.pollBodyReady &&
  left?.pollHeaderReady === right?.pollHeaderReady &&
  left?.pollHostReady === right?.pollHostReady;

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
      shellLocalState.setHoldPersistentPollLane(false);
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
        // dismiss verb's ONE terminalDismiss switch (targetSceneKey 'search', docked-polls
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
          releaseReadyCloseSnapshot.arePersistentPollsBodyReady &&
          releaseReadyCloseSnapshot.arePersistentPollsHeaderReady &&
          releaseReadyCloseSnapshot.canExposePersistentPolls &&
          releaseReadyCloseSnapshot.canReleasePersistentPolls &&
          releaseReadyCloseSnapshot.isPersistentPollHostReady);
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
          arePersistentPollsBodyReady: releaseReadyCloseSnapshot.arePersistentPollsBodyReady,
          arePersistentPollsHeaderReady: releaseReadyCloseSnapshot.arePersistentPollsHeaderReady,
          canExposePersistentPolls: releaseReadyCloseSnapshot.canExposePersistentPolls,
          canReleasePersistentPolls: releaseReadyCloseSnapshot.canReleasePersistentPolls,
          boundaryTrigger: 'collapsed_motion_plane_boundary',
          isPersistentPollHostReady: releaseReadyCloseSnapshot.isPersistentPollHostReady,
          isResultsExitCollapsedSettled: releaseReadyCloseSnapshot.isResultsExitCollapsedSettled,
          isResultsExitMapSettled: releaseReadyCloseSnapshot.isResultsExitMapSettled,
          persistentPollsSwitchAtBottomSnap: true,
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
      shellLocalState.setSearchCloseTransitionState((current) => {
        const update = applySearchCloseMapExitSettled({
          current,
          closeIntentId,
        });
        return update.nextState;
      });
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
          persistentPollsPrepareAtBottomSnap: true,
          persistentPollsSwitchAtBottomSnap: true,
          snap,
          transactionId: activeCloseIntentId,
        });
      }
      getSearchSurfaceRuntime().commitDismissBoundary(activeCloseIntentId);
      shellLocalState.setHoldPersistentPollLane(false);
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
      boundaryCloseIntentIdRef,
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
      shellLocalState.setSearchCloseTransitionState((current) => {
        const update = applySearchCloseSheetSettled({
          current,
          closeIntentId: activeCloseIntentId,
          snap,
        });
        return update.nextState;
      });
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
    [beginCloseTransitionIntent, shellLocalState.searchCloseTransitionState]
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
      shellLocalState.setHoldPersistentPollLane(false);
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
