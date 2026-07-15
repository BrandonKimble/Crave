import React from 'react';
import {
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import {
  getPerfScenarioWorkNow,
  logPerfScenarioWorkSpan,
} from '../../../../perf/perf-scenario-work-span';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import {
  areSearchSurfaceVisualPoliciesEqual,
  getSearchSurfaceRuntime,
  selectSearchSurfaceVisualPolicy,
  type SearchSurfaceMotionPlaneObservationTarget,
  type SearchSurfaceRuntimeSnapshot,
  useSearchSurfaceRuntimeSelector,
} from '../surface/search-surface-runtime';
import type { SheetPosition } from '../../../../overlays/sheetUtils';
import {
  hasCrossedSnap,
  DEFAULT_SNAP_CROSSING_BASE_EPSILON_PX,
  DEFAULT_SNAP_CROSSING_MAX_EPSILON_PX,
} from '../../../../navigation/runtime/transition-engine/snap-crossing-predicate';
import {
  readDismissBoundarySwapGate,
  subscribeDismissBoundarySwapGate,
} from '../../../../navigation/runtime/transition-engine/dismiss-boundary-swap-gate';

const SEARCH_DISMISS_PROOF_EARLY_PROGRESS_MIN = 0.1;
const SEARCH_DISMISS_PROOF_EARLY_PROGRESS_MAX = 0.4;
const SEARCH_DISMISS_PROOF_MID_PROGRESS_MIN = 0.4;
const SEARCH_DISMISS_PROOF_MID_PROGRESS_MAX = 0.7;
const SEARCH_DISMISS_COLLAPSED_BOUNDARY_EPSILON_PT = 1;
const SEARCH_DISMISS_VISUAL_HANDOFF_PROGRESS_MIN = 0.8;
const SEARCH_DISMISS_MOTION_BOUNDARY_TIMEOUT_MS = 420;

const clamp01 = (value: number): number => {
  'worklet';
  return Math.max(0, Math.min(1, value));
};

const resolveSearchDismissProgress = (
  sheetY: number,
  startY: number,
  collapsedY: number
): number => {
  'worklet';
  const distance = collapsedY - startY;
  if (Math.abs(distance) < 0.5) {
    return 1;
  }
  return clamp01((sheetY - startY) / distance);
};

const resolveSearchDismissVisualBoundaryReached = (
  dismissMotionActive: number,
  dismissMotionBoundaryReached: number,
  dismissMotionPollPageReadyForBoundary: number,
  sheetY: number,
  collapsedY: number
): boolean => {
  'worklet';
  if (dismissMotionBoundaryReached >= 0.5) {
    return true;
  }
  if (dismissMotionActive < 0.5) {
    return false;
  }
  if (dismissMotionPollPageReadyForBoundary < 0.5) {
    return false;
  }
  return sheetY >= collapsedY - SEARCH_DISMISS_COLLAPSED_BOUNDARY_EPSILON_PT;
};

type SearchSurfaceMotionPlaneSample = {
  boundaryReached: boolean;
  boundaryY: number;
  collapsedY: number;
  physicalCollapsedSettled: boolean;
  pollPageReadyForBoundary: boolean;
  pollPageReleasedForBoundary: boolean;
  pageBundleHandoffLatched: boolean;
  proofStage: SearchDismissMotionProofStage;
  progress: number;
  rawStartY: number;
  sampleBucket: number;
  sheetY: number;
  startSource: 'sharedValue' | 'visibleSnap' | 'cachedVisible';
  startY: number;
  visualOwnerReleasedForBoundary: boolean;
  visualHandoffThresholdProgress: number;
  waitingForPollOwnerAtBoundary: boolean;
  waitingForPollPageAtBoundary: boolean;
};

type SearchDismissMotionProofStage = 'early_progress' | 'mid_progress' | 'late_progress' | 'motion';

type UseSearchDismissMotionPlaneRuntimeArgs = {
  isCloseTransitionActive: boolean;
  sheetTranslateY: SharedValue<number>;
  currentSheetSnap: SheetPosition;
  snapPoints: Record<Exclude<SheetPosition, 'hidden'>, number> & { hidden?: number };
  collapsedSnap: number;
  notifyCloseCollapsedBoundaryReached: () => void;
  notifyCloseSheetSettled: () => void;
};

type SearchDismissMotionPlaneRuntime = {
  searchSurfacePageBundleProgress: DerivedValue<number>;
  searchDismissMotionProgress: DerivedValue<number>;
};

const resolveSearchDismissMotionProofStage = (
  progress: number,
  boundaryReached: boolean
): SearchDismissMotionProofStage => {
  'worklet';
  if (boundaryReached) {
    return 'motion';
  }
  if (
    progress >= SEARCH_DISMISS_PROOF_EARLY_PROGRESS_MIN &&
    progress <= SEARCH_DISMISS_PROOF_EARLY_PROGRESS_MAX
  ) {
    return 'early_progress';
  }
  if (
    progress >= SEARCH_DISMISS_PROOF_MID_PROGRESS_MIN &&
    progress <= SEARCH_DISMISS_PROOF_MID_PROGRESS_MAX
  ) {
    return 'mid_progress';
  }
  if (progress > SEARCH_DISMISS_PROOF_MID_PROGRESS_MAX) {
    return 'late_progress';
  }
  return 'motion';
};

export const useSearchDismissMotionPlaneRuntime = ({
  isCloseTransitionActive,
  sheetTranslateY,
  currentSheetSnap,
  snapPoints,
  collapsedSnap,
  notifyCloseCollapsedBoundaryReached,
  notifyCloseSheetSettled,
}: UseSearchDismissMotionPlaneRuntimeArgs): SearchDismissMotionPlaneRuntime => {
  const surfaceVisualPolicy = useSearchSurfaceRuntimeSelector(
    selectSearchSurfaceVisualPolicy,
    areSearchSurfaceVisualPoliciesEqual
  );
  const dismissBoundaryReadiness = useSearchSurfaceRuntimeSelector(
    React.useCallback((snapshot) => {
      const dismissTransaction = snapshot.dismissTransaction;
      return {
        transactionId: dismissTransaction?.id ?? null,
        pollPageReadyForBoundary:
          dismissTransaction != null &&
          dismissTransaction.pollHeaderReady &&
          dismissTransaction.pollBodyReady &&
          dismissTransaction.pollHostReady,
        pollPageReleasedForBoundary:
          dismissTransaction != null &&
          dismissTransaction.pollHeaderReady &&
          dismissTransaction.pollBodyReady &&
          dismissTransaction.pollHostReady &&
          dismissTransaction.bottomBoundaryReached,
      };
    }, []),
    (left, right) =>
      left.transactionId === right.transactionId &&
      left.pollPageReadyForBoundary === right.pollPageReadyForBoundary &&
      left.pollPageReleasedForBoundary === right.pollPageReleasedForBoundary
  );
  const activeScenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);
  const activeDismissTransactionIdRef = React.useRef<string | null>(null);
  const activeOpenTransactionIdRef = React.useRef<string | null>(null);
  const pendingOpenMotionStartedCallbackRef = React.useRef<(() => void) | null>(null);
  const dismissMotionBoundaryTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissMotionActive = useSharedValue(0);
  const openMotionActive = useSharedValue(0);
  const openMotionStartedAck = useSharedValue(0);
  const dismissMotionBoundaryReached = useSharedValue(0);
  const dismissMotionPageBundleHandoffProgress = useSharedValue(0);
  const dismissMotionPollPageReadyForBoundary = useSharedValue(0);
  const dismissMotionPollPageReleasedForBoundary = useSharedValue(0);
  const dismissMotionWaitingForPollPageAtBoundary = useSharedValue(0);
  // Leg 3: previous-frame sheet Y for the crossing predicate's velocity scaling.
  const dismissMotionPrevSheetY = useSharedValue(Number.NaN);
  // Leg 3: the live player's paintAck handle (staged swap gate) — re-captured whenever
  // the host registers/unregisters it, so the crossing worklet holds a live SV.
  const dismissBoundarySwapGate = React.useSyncExternalStore(
    subscribeDismissBoundarySwapGate,
    readDismissBoundarySwapGate
  );
  const dismissMotionStartY = useSharedValue(collapsedSnap);
  const dismissMotionCollapsedY = useSharedValue(collapsedSnap);
  const dismissMotionRawStartY = useSharedValue(collapsedSnap);
  const dismissMotionCachedVisibleStartY = useSharedValue(Number.NaN);
  const dismissMotionStartSource = useSharedValue<0 | 1 | 2>(0);
  const dismissMotionEarlyProofEmitted = useSharedValue(0);
  const dismissMotionMidProofEmitted = useSharedValue(0);
  const openMotionStartY = useSharedValue(collapsedSnap);
  const openMotionTargetY = useSharedValue(snapPoints.middle);
  const openMotionSettled = useSharedValue(0);
  const lastPollPageReadyForBoundaryRef = React.useRef(false);
  const lastPollPageReleasedForBoundaryRef = React.useRef(false);

  const logDismissMotionPlaneSample = React.useCallback(
    (sample: SearchSurfaceMotionPlaneSample) => {
      if (!isPerfScenarioAttributionActive(activeScenarioConfig)) {
        return;
      }
      const startedAtMs = getPerfScenarioWorkNow();
      const sheetTravelPx = Math.abs(sample.collapsedY - sample.startY);
      logPerfScenarioAttributionEvent('VisualReadiness', activeScenarioConfig, {
        event: 'search_dismiss_motion_plane_contract',
        authority: 'SearchSurfaceMotionPlaneRuntime',
        boundaryReached: sample.boundaryReached,
        boundaryCommitSource: 'searchSurfaceMotionPlane',
        boundaryY: sample.boundaryY,
        collapsedY: sample.collapsedY,
        dismissMotionDurationMs: null,
        dismissProgress: sample.progress,
        navReturnProgress: null,
        navReturnProgressSource: 'bottomNavTiming',
        physicalCollapsedSettled: sample.physicalCollapsedSettled,
        pageBundleHandoffLatched: sample.pageBundleHandoffLatched,
        pollPageReadyForBoundary: sample.pollPageReadyForBoundary,
        pollPageReleasedForBoundary: sample.pollPageReleasedForBoundary,
        proofStage: sample.proofStage,
        resultPageBundleFrozenUntilBoundary: !sample.boundaryReached,
        resultSheetSlidingDown: sample.progress > 0 && sample.progress < 1,
        sampleBucket: sample.sampleBucket,
        sheetMotionSource: 'routeSheetMotionCommandObservedBySearchSurfaceMotionPlane',
        sheetTravelPx,
        sheetY: sample.sheetY,
        rawStartY: sample.rawStartY,
        startSource: sample.startSource,
        startY: sample.startY,
        transactionId: activeDismissTransactionIdRef.current,
        visualOwnerReleasedForBoundary: sample.visualOwnerReleasedForBoundary,
        visualHandoffThresholdProgress: sample.visualHandoffThresholdProgress,
        waitingForPollOwnerAtBoundary: sample.waitingForPollOwnerAtBoundary,
        waitingForPollPageAtBoundary: sample.waitingForPollPageAtBoundary,
      });
      logPerfScenarioWorkSpan({
        owner: 'search_dismiss_motion_plane_sample_log',
        path: sample.proofStage,
        startedAtMs,
        details: {
          boundaryReached: sample.boundaryReached,
          progress: sample.progress,
          transactionId: activeDismissTransactionIdRef.current,
        },
      });
    },
    [activeScenarioConfig]
  );

  const markDismissBoundaryReached = React.useCallback(() => {
    if (activeDismissTransactionIdRef.current == null) {
      return;
    }
    if (dismissMotionBoundaryTimeoutRef.current != null) {
      clearTimeout(dismissMotionBoundaryTimeoutRef.current);
      dismissMotionBoundaryTimeoutRef.current = null;
    }
    notifyCloseCollapsedBoundaryReached();
    notifyCloseSheetSettled();
  }, [notifyCloseCollapsedBoundaryReached, notifyCloseSheetSettled]);

  const armDismissMotionBoundaryWatchdog = React.useCallback(
    (transactionId: string) => {
      if (dismissMotionBoundaryTimeoutRef.current != null) {
        clearTimeout(dismissMotionBoundaryTimeoutRef.current);
      }
      dismissMotionBoundaryTimeoutRef.current = setTimeout(() => {
        dismissMotionBoundaryTimeoutRef.current = null;
        if (activeDismissTransactionIdRef.current !== transactionId) {
          return;
        }
        if (dismissMotionBoundaryReached.value >= 0.5) {
          return;
        }
        if (!isPerfScenarioAttributionActive(activeScenarioConfig)) {
          return;
        }
        logPerfScenarioAttributionEvent('VisualReadiness', activeScenarioConfig, {
          event: 'search_dismiss_motion_plane_watchdog_contract',
          authority: 'SearchSurfaceMotionPlaneRuntime',
          collapsedY: dismissMotionCollapsedY.value,
          dismissProgress: resolveSearchDismissProgress(
            sheetTranslateY.value,
            dismissMotionStartY.value,
            dismissMotionCollapsedY.value
          ),
          motionObserved: sheetTranslateY.value > dismissMotionStartY.value + 1,
          pollPageReadyForBoundary: dismissMotionPollPageReadyForBoundary.value >= 0.5,
          sheetY: sheetTranslateY.value,
          startY: dismissMotionStartY.value,
          transactionId,
        });
      }, SEARCH_DISMISS_MOTION_BOUNDARY_TIMEOUT_MS);
    },
    [
      activeScenarioConfig,
      dismissMotionBoundaryReached,
      dismissMotionCollapsedY,
      dismissMotionPollPageReadyForBoundary,
      dismissMotionStartY,
      sheetTranslateY,
    ]
  );

  const markOpenSheetSettled = React.useCallback(() => {
    if (activeOpenTransactionIdRef.current == null) {
      return;
    }
    getSearchSurfaceRuntime().markRedrawSheetReady(activeOpenTransactionIdRef.current);
  }, []);

  const notifyOpenMotionStarted = React.useCallback(() => {
    const callback = pendingOpenMotionStartedCallbackRef.current;
    pendingOpenMotionStartedCallbackRef.current = null;
    callback?.();
  }, []);

  const commitDismissBoundary = React.useCallback(() => {
    'worklet';
    dismissMotionWaitingForPollPageAtBoundary.value = 0;
    dismissMotionBoundaryReached.value = 1;
    dismissMotionPageBundleHandoffProgress.value = 1;
    dismissMotionCachedVisibleStartY.value = Number.NaN;
    runOnJS(markDismissBoundaryReached)();
  }, [
    dismissMotionBoundaryReached,
    dismissMotionCachedVisibleStartY,
    dismissMotionPageBundleHandoffProgress,
    dismissMotionWaitingForPollPageAtBoundary,
    markDismissBoundaryReached,
  ]);

  const observeDismissMotion = React.useCallback<
    SearchSurfaceMotionPlaneObservationTarget['observeDismiss']
  >(
    ({ transactionId }) => {
      if (
        activeDismissTransactionIdRef.current === transactionId &&
        dismissMotionActive.value >= 0.5 &&
        dismissMotionBoundaryReached.value < 0.5
      ) {
        return;
      }
      activeOpenTransactionIdRef.current = null;
      pendingOpenMotionStartedCallbackRef.current = null;
      if (dismissMotionBoundaryTimeoutRef.current != null) {
        clearTimeout(dismissMotionBoundaryTimeoutRef.current);
        dismissMotionBoundaryTimeoutRef.current = null;
      }
      openMotionActive.value = 0;
      openMotionStartedAck.value = 0;
      activeDismissTransactionIdRef.current = transactionId;
      armDismissMotionBoundaryWatchdog(transactionId);
      const rawStartY = sheetTranslateY.value;
      const targetY = collapsedSnap;
      const currentSnapY = snapPoints[currentSheetSnap] ?? rawStartY;
      const hasVisibleSnapStart =
        currentSheetSnap !== 'hidden' &&
        Number.isFinite(currentSnapY) &&
        currentSnapY < targetY - 0.5;
      const rawStartIsVisibleDismissPosition =
        Number.isFinite(rawStartY) && rawStartY < targetY - 0.5;
      const cachedVisibleStartY = dismissMotionCachedVisibleStartY.value;
      const hasCachedVisibleStart =
        Number.isFinite(cachedVisibleStartY) && cachedVisibleStartY < targetY - 8;
      const startY = rawStartIsVisibleDismissPosition
        ? rawStartY
        : hasVisibleSnapStart
          ? currentSnapY
          : hasCachedVisibleStart
            ? cachedVisibleStartY
            : rawStartY;
      dismissMotionStartY.value = startY;
      dismissMotionRawStartY.value = rawStartY;
      dismissMotionStartSource.value = startY === rawStartY ? 0 : startY === currentSnapY ? 1 : 2;
      dismissMotionCollapsedY.value = targetY;
      openMotionActive.value = 0;
      dismissMotionBoundaryReached.value = 0;
      dismissMotionPageBundleHandoffProgress.value = 0;
      dismissMotionEarlyProofEmitted.value = 0;
      dismissMotionMidProofEmitted.value = 0;
      const activeDismissTransaction = getSearchSurfaceRuntime().getSnapshot().dismissTransaction;
      const pollPageReadyForBoundary =
        activeDismissTransaction != null &&
        activeDismissTransaction.id === transactionId &&
        activeDismissTransaction.pollHeaderReady &&
        activeDismissTransaction.pollBodyReady &&
        activeDismissTransaction.pollHostReady;
      dismissMotionPollPageReadyForBoundary.value = pollPageReadyForBoundary ? 1 : 0;
      dismissMotionWaitingForPollPageAtBoundary.value = 0;
      dismissMotionActive.value = 1;
      const startRequiresObservedDismissMotion =
        rawStartIsVisibleDismissPosition || hasVisibleSnapStart || hasCachedVisibleStart;
      const canCompleteImmediately =
        (currentSheetSnap === 'collapsed' || currentSheetSnap === 'hidden') &&
        !startRequiresObservedDismissMotion &&
        Math.abs(targetY - rawStartY) < 0.5;
      if (canCompleteImmediately) {
        dismissMotionWaitingForPollPageAtBoundary.value = 0;
        dismissMotionBoundaryReached.value = 1;
        dismissMotionPageBundleHandoffProgress.value = 1;
        dismissMotionCachedVisibleStartY.value = Number.NaN;
        markDismissBoundaryReached();
        return;
      }
    },
    [
      collapsedSnap,
      currentSheetSnap,
      dismissMotionActive,
      dismissMotionBoundaryReached,
      dismissMotionCachedVisibleStartY,
      dismissMotionCollapsedY,
      dismissMotionPageBundleHandoffProgress,
      dismissMotionPollPageReadyForBoundary,
      dismissMotionRawStartY,
      dismissMotionStartSource,
      dismissMotionStartY,
      dismissMotionWaitingForPollPageAtBoundary,
      markDismissBoundaryReached,
      openMotionActive,
      openMotionStartedAck,
      armDismissMotionBoundaryWatchdog,
      sheetTranslateY,
      snapPoints,
    ]
  );

  const observeOpenMotion = React.useCallback<
    SearchSurfaceMotionPlaneObservationTarget['observeOpen']
  >(
    ({ transactionId, onStarted }) => {
      if (dismissMotionBoundaryTimeoutRef.current != null) {
        clearTimeout(dismissMotionBoundaryTimeoutRef.current);
        dismissMotionBoundaryTimeoutRef.current = null;
      }
      activeDismissTransactionIdRef.current = null;
      pendingOpenMotionStartedCallbackRef.current = onStarted;
      activeOpenTransactionIdRef.current = transactionId;
      const targetY = snapPoints.middle;
      const collapsedY = collapsedSnap;
      const rawStartY = sheetTranslateY.value;
      const startY =
        Number.isFinite(rawStartY) && rawStartY > targetY + 0.5 && rawStartY < collapsedY - 0.5
          ? rawStartY
          : collapsedY;
      openMotionStartY.value = startY;
      openMotionTargetY.value = targetY;
      openMotionStartedAck.value = 0;
      openMotionSettled.value = 0;
      dismissMotionActive.value = 0;
      dismissMotionBoundaryReached.value = 0;
      dismissMotionPageBundleHandoffProgress.value = 0;
      openMotionActive.value = 1;
      if (rawStartY <= targetY + 0.5) {
        openMotionSettled.value = 1;
        notifyOpenMotionStarted();
        markOpenSheetSettled();
        return;
      }
    },
    [
      collapsedSnap,
      dismissMotionActive,
      dismissMotionBoundaryReached,
      dismissMotionPageBundleHandoffProgress,
      markOpenSheetSettled,
      notifyOpenMotionStarted,
      openMotionActive,
      openMotionSettled,
      openMotionStartedAck,
      openMotionStartY,
      openMotionTargetY,
      sheetTranslateY,
      snapPoints.middle,
    ]
  );

  const syncMotionFromSurfaceSnapshot = React.useCallback(
    (snapshot: SearchSurfaceRuntimeSnapshot) => {
      const policy = selectSearchSurfaceVisualPolicy(snapshot);
      const dismissTransaction = snapshot.dismissTransaction;
      const isPollPageReadyForActiveDismiss =
        dismissTransaction != null &&
        dismissTransaction.id === policy.transactionId &&
        dismissTransaction.pollHeaderReady &&
        dismissTransaction.pollBodyReady &&
        dismissTransaction.pollHostReady;
      const isPollPageReleasedForActiveDismiss =
        dismissTransaction != null &&
        dismissTransaction.id === policy.transactionId &&
        dismissTransaction.pollHeaderReady &&
        dismissTransaction.pollBodyReady &&
        dismissTransaction.pollHostReady &&
        dismissTransaction.bottomBoundaryReached &&
        policy.canReleasePersistentPolls;
      dismissMotionPollPageReadyForBoundary.value = isPollPageReadyForActiveDismiss ? 1 : 0;
      dismissMotionPollPageReleasedForBoundary.value = isPollPageReleasedForActiveDismiss ? 1 : 0;

      if (policy.phase === 'results_dismissing' && policy.transactionId != null) {
        activeOpenTransactionIdRef.current = null;
        openMotionActive.value = 0;
        lastPollPageReadyForBoundaryRef.current = isPollPageReadyForActiveDismiss;
        lastPollPageReleasedForBoundaryRef.current = isPollPageReleasedForActiveDismiss;
        return;
      }

      activeDismissTransactionIdRef.current = null;
      lastPollPageReadyForBoundaryRef.current = false;
      lastPollPageReleasedForBoundaryRef.current = false;
      dismissMotionActive.value = 0;
      dismissMotionBoundaryReached.value = 0;
      dismissMotionPollPageReleasedForBoundary.value = 0;
      dismissMotionWaitingForPollPageAtBoundary.value = 0;

      if (policy.phase === 'results_redrawing' && policy.transactionId != null) {
        dismissMotionPageBundleHandoffProgress.value = 0;
        return;
      }

      activeOpenTransactionIdRef.current = null;
      openMotionActive.value = 0;
    },
    [
      dismissMotionActive,
      dismissMotionBoundaryReached,
      dismissMotionPageBundleHandoffProgress,
      dismissMotionPollPageReadyForBoundary,
      dismissMotionPollPageReleasedForBoundary,
      dismissMotionWaitingForPollPageAtBoundary,
      openMotionActive,
    ]
  );

  React.useLayoutEffect(() => {
    const unregister = getSearchSurfaceRuntime().registerMotionPlaneObservationTarget({
      observeDismiss: observeDismissMotion,
      observeOpen: observeOpenMotion,
    });
    return () => {
      if (dismissMotionBoundaryTimeoutRef.current != null) {
        clearTimeout(dismissMotionBoundaryTimeoutRef.current);
        dismissMotionBoundaryTimeoutRef.current = null;
      }
      unregister();
    };
  }, [observeDismissMotion, observeOpenMotion]);

  React.useLayoutEffect(() => {
    syncMotionFromSurfaceSnapshot(getSearchSurfaceRuntime().getSnapshot());
  }, [
    dismissBoundaryReadiness.pollPageReadyForBoundary,
    dismissBoundaryReadiness.pollPageReleasedForBoundary,
    dismissBoundaryReadiness.transactionId,
    surfaceVisualPolicy.canReleasePersistentPolls,
    surfaceVisualPolicy.phase,
    surfaceVisualPolicy.transactionId,
    syncMotionFromSurfaceSnapshot,
  ]);

  React.useEffect(
    () =>
      getSearchSurfaceRuntime().subscribe(() => {
        syncMotionFromSurfaceSnapshot(getSearchSurfaceRuntime().getSnapshot());
      }),
    [syncMotionFromSurfaceSnapshot]
  );

  useAnimatedReaction(
    () => {
      if (dismissMotionActive.value >= 0.5) {
        return null;
      }
      const targetY = collapsedSnap;
      const currentY = sheetTranslateY.value;
      if (!Number.isFinite(currentY) || currentY >= targetY - 8) {
        return null;
      }
      return currentY;
    },
    (nextVisibleY) => {
      if (nextVisibleY == null) {
        return;
      }
      dismissMotionCachedVisibleStartY.value = nextVisibleY;
    },
    [collapsedSnap, dismissMotionActive, dismissMotionCachedVisibleStartY, sheetTranslateY]
  );

  useAnimatedReaction(
    () => dismissMotionPollPageReadyForBoundary.value,
    (nextReady, previousReady) => {
      if (nextReady < 0.5 || previousReady === nextReady) {
        return;
      }
      if (
        dismissMotionActive.value < 0.5 ||
        dismissMotionBoundaryReached.value >= 0.5 ||
        dismissMotionWaitingForPollPageAtBoundary.value < 0.5
      ) {
        return;
      }
      commitDismissBoundary();
    },
    [
      commitDismissBoundary,
      dismissMotionActive,
      dismissMotionBoundaryReached,
      dismissMotionPollPageReadyForBoundary,
      dismissMotionWaitingForPollPageAtBoundary,
    ]
  );

  useAnimatedReaction(
    () => {
      if (dismissMotionActive.value < 0.5 || dismissMotionBoundaryReached.value >= 0.5) {
        dismissMotionPrevSheetY.value = sheetTranslateY.value;
        return 0;
      }
      // Leg 3 (design §4.2, ledger N-3/O-2): the crossing is the velocity-scaled
      // snap-crossing predicate — the tolerance arms one frame of travel BEFORE the
      // numeric collapsed Y (capped), so the frame rendered AT the snap already shows
      // the destination bundle. The old constant 1pt epsilon armed too late and then
      // paid the runOnJS→store→React round trip (the owner's "slightly late" switch).
      const currentY = sheetTranslateY.value;
      const velocityPxPerFrame = currentY - dismissMotionPrevSheetY.value;
      dismissMotionPrevSheetY.value = currentY;
      const reachedCollapsedBoundary = hasCrossedSnap(
        {
          targetY: dismissMotionCollapsedY.value,
          baseEpsilonPx: DEFAULT_SNAP_CROSSING_BASE_EPSILON_PX,
          maxEpsilonPx: DEFAULT_SNAP_CROSSING_MAX_EPSILON_PX,
        },
        currentY,
        velocityPxPerFrame
      );
      if (!reachedCollapsedBoundary) {
        return 0;
      }
      if (dismissMotionPollPageReadyForBoundary.value < 0.5) {
        dismissMotionWaitingForPollPageAtBoundary.value = 1;
        return 0;
      }
      dismissMotionWaitingForPollPageAtBoundary.value = 0;
      // THE FREEZE PRIMITIVE'S VISUAL HALF: flip the staged swap gate (the live
      // player's paintAck — roles staged at dismiss-arm with the outgoing held
      // opaque) ON THE UI THREAD in the crossing frame. The JS half below
      // (commitDismissBoundary) remains the store/React cleanup and may trail.
      if (dismissBoundarySwapGate != null) {
        dismissBoundarySwapGate.value = 1;
      }
      return 1;
    },
    (boundaryReached) => {
      if (boundaryReached < 0.5 || dismissMotionBoundaryReached.value >= 0.5) {
        return;
      }
      commitDismissBoundary();
    },
    [
      commitDismissBoundary,
      dismissBoundarySwapGate,
      dismissMotionActive,
      dismissMotionBoundaryReached,
      dismissMotionCollapsedY,
      dismissMotionPollPageReadyForBoundary,
      dismissMotionPrevSheetY,
      dismissMotionWaitingForPollPageAtBoundary,
      sheetTranslateY,
    ]
  );

  const searchDismissMotionProgress = useDerivedValue(() => {
    if (dismissMotionActive.value < 0.5) {
      return 0;
    }
    if (dismissMotionBoundaryReached.value >= 0.5) {
      return 1;
    }
    return resolveSearchDismissProgress(
      sheetTranslateY.value,
      dismissMotionStartY.value,
      dismissMotionCollapsedY.value
    );
  }, [
    dismissMotionActive,
    dismissMotionBoundaryReached,
    dismissMotionCollapsedY,
    dismissMotionStartY,
    sheetTranslateY,
  ]);

  useAnimatedReaction(
    () => {
      if (openMotionActive.value < 0.5 || openMotionStartedAck.value >= 0.5) {
        return 0;
      }
      return Math.abs(sheetTranslateY.value - openMotionStartY.value) > 8 ? 1 : 0;
    },
    (shouldNotify) => {
      if (shouldNotify < 0.5 || openMotionStartedAck.value >= 0.5) {
        return;
      }
      openMotionStartedAck.value = 1;
      runOnJS(notifyOpenMotionStarted)();
    },
    [
      notifyOpenMotionStarted,
      openMotionActive,
      openMotionStartedAck,
      openMotionStartY,
      sheetTranslateY,
    ]
  );

  useAnimatedReaction(
    () => {
      if (openMotionActive.value < 0.5 || openMotionSettled.value >= 0.5) {
        return 0;
      }
      return sheetTranslateY.value <= openMotionTargetY.value + 1 ? 1 : 0;
    },
    (settled) => {
      if (settled < 0.5 || openMotionSettled.value >= 0.5) {
        return;
      }
      openMotionSettled.value = 1;
      runOnJS(markOpenSheetSettled)();
    },
    [markOpenSheetSettled, openMotionActive, openMotionSettled, openMotionTargetY, sheetTranslateY]
  );

  const searchSurfacePageBundleProgress = useDerivedValue<number>(() => {
    return dismissMotionPollPageReleasedForBoundary.value >= 0.5 ? 1 : 0;
  }, [dismissMotionPollPageReleasedForBoundary]);

  useAnimatedReaction(
    () => {
      if (dismissMotionActive.value < 0.5) {
        return null;
      }
      const progress = searchDismissMotionProgress.value;
      const visualBoundaryReady = resolveSearchDismissVisualBoundaryReached(
        dismissMotionActive.value,
        dismissMotionBoundaryReached.value,
        dismissMotionPollPageReadyForBoundary.value,
        sheetTranslateY.value,
        dismissMotionCollapsedY.value
      );
      const boundaryReached =
        dismissMotionPageBundleHandoffProgress.value >= 0.5 || visualBoundaryReady;
      const physicalCollapsedSettled =
        sheetTranslateY.value >=
        dismissMotionCollapsedY.value - SEARCH_DISMISS_COLLAPSED_BOUNDARY_EPSILON_PT;
      const proofStage = resolveSearchDismissMotionProofStage(progress, boundaryReached);
      const shouldEmitProofEdge =
        boundaryReached || proofStage === 'early_progress' || proofStage === 'mid_progress';
      if (!shouldEmitProofEdge) {
        return null;
      }
      if (proofStage === 'early_progress') {
        if (dismissMotionEarlyProofEmitted.value >= 0.5) {
          return null;
        }
        dismissMotionEarlyProofEmitted.value = 1;
      }
      if (proofStage === 'mid_progress') {
        if (dismissMotionMidProofEmitted.value >= 0.5) {
          return null;
        }
        dismissMotionMidProofEmitted.value = 1;
      }
      return {
        boundaryReached,
        boundaryY: dismissMotionCollapsedY.value,
        collapsedY: dismissMotionCollapsedY.value,
        physicalCollapsedSettled,
        pageBundleHandoffLatched: dismissMotionPageBundleHandoffProgress.value >= 0.5,
        pollPageReadyForBoundary: dismissMotionPollPageReadyForBoundary.value >= 0.5,
        pollPageReleasedForBoundary:
          dismissMotionPollPageReleasedForBoundary.value >= 0.5 || visualBoundaryReady,
        proofStage,
        progress,
        rawStartY: dismissMotionRawStartY.value,
        sampleBucket: Math.round(progress * 4),
        sheetY: sheetTranslateY.value,
        startSource:
          dismissMotionStartSource.value === 2
            ? ('cachedVisible' as const)
            : dismissMotionStartSource.value === 1
              ? ('visibleSnap' as const)
              : ('sharedValue' as const),
        startY: dismissMotionStartY.value,
        visualOwnerReleasedForBoundary: boundaryReached,
        visualHandoffThresholdProgress: SEARCH_DISMISS_VISUAL_HANDOFF_PROGRESS_MIN,
        waitingForPollOwnerAtBoundary: dismissMotionWaitingForPollPageAtBoundary.value >= 0.5,
        waitingForPollPageAtBoundary: dismissMotionWaitingForPollPageAtBoundary.value >= 0.5,
      };
    },
    (nextSample, previousSample) => {
      if (nextSample == null) {
        return;
      }
      if (
        previousSample != null &&
        nextSample.boundaryReached === previousSample.boundaryReached &&
        nextSample.pollPageReadyForBoundary === previousSample.pollPageReadyForBoundary &&
        nextSample.pollPageReleasedForBoundary === previousSample.pollPageReleasedForBoundary &&
        nextSample.proofStage === previousSample.proofStage &&
        nextSample.waitingForPollOwnerAtBoundary === previousSample.waitingForPollOwnerAtBoundary
      ) {
        return;
      }
      runOnJS(logDismissMotionPlaneSample)(nextSample);
    },
    [
      dismissMotionActive,
      dismissMotionBoundaryReached,
      dismissMotionCollapsedY,
      dismissMotionEarlyProofEmitted,
      dismissMotionPageBundleHandoffProgress,
      dismissMotionMidProofEmitted,
      dismissMotionPollPageReadyForBoundary,
      dismissMotionPollPageReleasedForBoundary,
      dismissMotionRawStartY,
      dismissMotionStartSource,
      dismissMotionStartY,
      dismissMotionWaitingForPollPageAtBoundary,
      logDismissMotionPlaneSample,
      searchDismissMotionProgress,
      sheetTranslateY,
    ]
  );

  return React.useMemo(
    () => ({
      searchSurfacePageBundleProgress,
      searchDismissMotionProgress,
    }),
    [searchSurfacePageBundleProgress, searchDismissMotionProgress]
  );
};
