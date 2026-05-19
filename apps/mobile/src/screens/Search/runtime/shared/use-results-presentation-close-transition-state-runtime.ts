import React from 'react';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import {
  getPerfScenarioWorkNow,
  logPerfScenarioWorkSpan,
} from '../../../../perf/perf-scenario-work-span';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { SearchCloseTransitionState } from './results-presentation-shell-contract';
import type { ResultsCloseTransitionActions } from './results-presentation-shell-runtime-contract';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import { useResultsPresentationCloseTransitionFinalizeRuntime } from './use-results-presentation-close-transition-finalize-runtime';
import { useResultsPresentationCloseTransitionIntentRuntime } from './use-results-presentation-close-transition-intent-runtime';
import {
  applySearchCloseCollapsedReached,
  applySearchCloseMapExitSettled,
  applySearchCloseSheetSettled,
  isSearchCloseTransitionReadyToFinalize,
} from './results-presentation-shell-close-transition-state';
import {
  getSearchSurfaceRuntime,
  selectSearchSurfaceVisualPolicy,
  type SearchSurfaceVisualPolicySnapshot,
  useSearchSurfaceRuntimeSelector,
} from '../surface/search-surface-runtime';

type UseResultsPresentationCloseTransitionStateRuntimeArgs = {
  clearSearchState: SearchClearOwner['clearSearchState'];
  armSearchCloseRestore: (
    options?: import('./results-presentation-shell-runtime-contract').ArmSearchCloseRestoreOptions
  ) => boolean;
  commitSearchCloseRestore: () => boolean;
  cancelSearchCloseRestore: () => void;
  flushPendingSearchOriginRestore: () => boolean;
  requestDefaultPostSearchRestore: (options?: { mode?: 'full' | 'chrome-only' }) => void;
  shellLocalState: ResultsPresentationShellLocalState;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
};

type ResultsPresentationCloseTransitionStateRuntime = {
  closeTransitionActions: ResultsCloseTransitionActions;
  beginCloseTransition: (
    closeIntentId: string,
    options?: { terminalDismissSource?: 'results' | 'profile' }
  ) => void;
  setPendingCloseIntentId: (intentId: string | null) => void;
  matchesPendingCloseIntentId: (intentId: string) => boolean;
};

const DISMISS_BOUNDARY_FINALIZE_DEFER_MS = 48;

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
  armSearchCloseRestore,
  commitSearchCloseRestore,
  cancelSearchCloseRestore,
  flushPendingSearchOriginRestore,
  requestDefaultPostSearchRestore,
  shellLocalState,
  routeSceneVisibilityPolicyRuntime,
}: UseResultsPresentationCloseTransitionStateRuntimeArgs): ResultsPresentationCloseTransitionStateRuntime => {
  const intentRuntime = useResultsPresentationCloseTransitionIntentRuntime({
    armSearchCloseRestore,
    shellLocalState,
    routeSceneVisibilityPolicyRuntime,
  });
  const finalizeRuntime = useResultsPresentationCloseTransitionFinalizeRuntime({
    clearSearchState,
    flushPendingSearchOriginRestore,
    requestDefaultPostSearchRestore,
    cancelSearchCloseRestore,
    shellLocalState,
    intentRuntime,
  });

  const boundaryCloseIntentIdRef = React.useRef<string | null>(null);
  const collapsedBoundaryReachedAtMsRef = React.useRef<number | null>(null);
  const releasedCloseIntentIdRef = React.useRef<string | null>(null);
  const deferredFinalizeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearDeferredFinalizeTimer = React.useCallback(() => {
    if (deferredFinalizeTimerRef.current == null) {
      return;
    }
    clearTimeout(deferredFinalizeTimerRef.current);
    deferredFinalizeTimerRef.current = null;
  }, []);
  const scheduleFinalizeCloseTransition = React.useCallback(
    (closeIntentId: string) => {
      clearDeferredFinalizeTimer();
      deferredFinalizeTimerRef.current = setTimeout(() => {
        deferredFinalizeTimerRef.current = null;
        if (intentRuntime.getActiveCloseIntentId() !== closeIntentId) {
          return;
        }
        finalizeRuntime.finalizeCloseTransition(closeIntentId);
      }, DISMISS_BOUNDARY_FINALIZE_DEFER_MS);
    },
    [
      clearDeferredFinalizeTimer,
      finalizeRuntime,
      intentRuntime,
      shellLocalState.searchCloseTransitionState,
    ]
  );

  React.useEffect(() => clearDeferredFinalizeTimer, [clearDeferredFinalizeTimer]);
  const emitReleaseReadyBottomHandoffTelemetry = React.useCallback(
    (
      releaseReadyCloseSnapshot: ReleaseReadyCloseSnapshot,
      options?: { releasedAtCollapsedBoundary?: boolean }
    ) => {
      const releaseReadyCloseIntentId = releaseReadyCloseSnapshot.transactionId;
      if (releaseReadyCloseIntentId == null) {
        return false;
      }
      if (intentRuntime.getActiveCloseIntentId() !== releaseReadyCloseIntentId) {
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
    [intentRuntime, shellLocalState]
  );

  const markSearchSheetCloseMapExitSettled = React.useCallback(
    (closeIntentId: string) => {
      let shouldFinalize = false;
      shellLocalState.setSearchCloseTransitionState((current) => {
        const update = applySearchCloseMapExitSettled({
          current,
          closeIntentId,
        });
        shouldFinalize = update.shouldFinalize;
        return update.nextState;
      });
      if (shouldFinalize) {
        scheduleFinalizeCloseTransition(closeIntentId);
      }
    },
    [intentRuntime, scheduleFinalizeCloseTransition, shellLocalState]
  );

  const markSearchSheetCloseCollapsedReached = React.useCallback(
    (
      snap: import('../../../../overlays/types').OverlaySheetSnap,
      source: 'motion_plane' = 'motion_plane'
    ) => {
      const activeCloseIntentId =
        intentRuntime.getActiveCloseIntentId() ?? boundaryCloseIntentIdRef.current;
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
      intentRuntime.commitArmedSearchCloseRestore(commitSearchCloseRestore);
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
      }
      if (isSearchCloseTransitionReadyToFinalize(nextCloseTransitionState)) {
        scheduleFinalizeCloseTransition(activeCloseIntentId);
      }
    },
    [
      boundaryCloseIntentIdRef,
      commitSearchCloseRestore,
      emitReleaseReadyBottomHandoffTelemetry,
      intentRuntime,
      scheduleFinalizeCloseTransition,
      shellLocalState,
    ]
  );

  const markSearchSheetCloseSheetSettled = React.useCallback(
    (snap: import('../../../../overlays/types').OverlaySheetSnap) => {
      const activeCloseIntentId = intentRuntime.getActiveCloseIntentId();
      if (!activeCloseIntentId || snap !== 'collapsed') {
        return;
      }
      intentRuntime.commitArmedSearchCloseRestore(commitSearchCloseRestore);
      let shouldFinalize = false;
      shellLocalState.setSearchCloseTransitionState((current) => {
        const update = applySearchCloseSheetSettled({
          current,
          closeIntentId: activeCloseIntentId,
          snap,
        });
        shouldFinalize = update.shouldFinalize;
        return update.nextState;
      });
      if (shouldFinalize) {
        scheduleFinalizeCloseTransition(activeCloseIntentId);
      }
    },
    [commitSearchCloseRestore, intentRuntime, scheduleFinalizeCloseTransition, shellLocalState]
  );

  const beginCloseTransition = React.useCallback(
    (closeIntentId: string, options?: { terminalDismissSource?: 'results' | 'profile' }) => {
      collapsedBoundaryReachedAtMsRef.current = null;
      releasedCloseIntentIdRef.current = null;
      clearDeferredFinalizeTimer();
      boundaryCloseIntentIdRef.current = closeIntentId;
      getSearchSurfaceRuntime().armDismissMotion({
        transactionId: closeIntentId,
        outgoingSheetSceneKey: options?.terminalDismissSource === 'profile' ? 'restaurant' : null,
      });
      intentRuntime.beginCloseTransition(closeIntentId, options);
    },
    [clearDeferredFinalizeTimer, intentRuntime, shellLocalState.searchCloseTransitionState]
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
      scheduleFinalizeCloseTransition(releaseReadyCloseIntentId);
    }
  }, [
    emitReleaseReadyBottomHandoffTelemetry,
    releaseReadyCloseSnapshot,
    scheduleFinalizeCloseTransition,
  ]);

  const cancelSearchSheetCloseTransition = React.useCallback(
    (closeIntentId?: string) => {
      clearDeferredFinalizeTimer();
      finalizeRuntime.cancelSearchSheetCloseTransition(closeIntentId);
    },
    [clearDeferredFinalizeTimer, finalizeRuntime]
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
      setPendingCloseIntentId: intentRuntime.setPendingCloseIntentId,
      matchesPendingCloseIntentId: intentRuntime.matchesPendingCloseIntentId,
    }),
    [
      beginCloseTransition,
      closeTransitionActions,
      intentRuntime.matchesPendingCloseIntentId,
      intentRuntime.setPendingCloseIntentId,
    ]
  );
};
