import React from 'react';
import {
  Easing,
  runOnJS,
  runOnUI,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE,
  resolveAppRouteNavSilhouetteClipSample,
  resolveRoundedAppRouteNavSilhouetteClipSample,
  resolveAppRouteNavSilhouetteSheetExclusionModeValue,
  useAppRouteNavSilhouetteSheetBodyExclusionHeightValue,
  useAppRouteNavSilhouetteSheetMaskHeightValue,
  useAppRouteNavSilhouetteMotionRuntime,
} from '../../../../navigation/runtime/app-route-nav-silhouette-authority';
import type {
  SearchForegroundBottomNavVisualRuntime,
  UseSearchForegroundVisualRuntimeArgs,
} from './use-search-foreground-visual-runtime-contract';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import {
  getPerfScenarioWorkNow,
  logPerfScenarioWorkSpan,
} from '../../../../perf/perf-scenario-work-span';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import { useHasNavHideIntent } from '../../../../navigation/runtime/nav-hide-intent-store';
import {
  areSearchSurfaceVisualPoliciesEqual,
  getSearchSurfaceRuntime,
  selectSearchSurfaceVisualPolicy,
  useSearchSurfaceRuntimeSelector,
} from '../surface/search-surface-runtime';
import {
  SEARCH_BOTTOM_NAV_MOTION_DURATION_MS,
  registerSearchBottomNavMotionCommandSink,
  type SearchBottomNavMotionTarget,
} from './search-bottom-nav-motion-runtime';

const commandBottomNavMotionOnUI = (
  bottomNavHideProgress: ReturnType<typeof useSharedValue<number>>,
  navBarCutoutIsHidingValue: ReturnType<typeof useSharedValue<boolean>>,
  target: SearchBottomNavMotionTarget
): void => {
  'worklet';
  navBarCutoutIsHidingValue.value = target === 'hide';
  bottomNavHideProgress.value = withTiming(target === 'hide' ? 0 : 1, {
    duration: SEARCH_BOTTOM_NAV_MOTION_DURATION_MS,
    easing: Easing.out(Easing.cubic),
  });
};

type SearchNavCutoutLockstepProofSample = ReturnType<
  typeof resolveRoundedAppRouteNavSilhouetteClipSample
> & {
  navCutoutProofEdge:
    | 'submit_hide_midpoint'
    | 'dismiss_pre_boundary_return'
    | 'persistent_poll_handoff';
  navCutoutProofProgress: number;
};

type UseSearchForegroundBottomNavVisualRuntimeArgs = Pick<
  UseSearchForegroundVisualRuntimeArgs,
  | 'shouldDimResultsSheet'
  | 'suggestionProgress'
  | 'isSearchOverlay'
  | 'inputMode'
  | 'searchSheetContentLaneKind'
  | 'navBarTopForSnaps'
  | 'fallbackNavBarHeight'
  | 'bottomNavHiddenTranslateY'
  | 'isSuggestionPanelActive'
  | 'backdropTarget'
>;

export const useSearchForegroundBottomNavVisualRuntime = ({
  shouldDimResultsSheet,
  suggestionProgress,
  isSearchOverlay,
  inputMode,
  searchSheetContentLaneKind,
  navBarTopForSnaps,
  fallbackNavBarHeight,
  bottomNavHiddenTranslateY,
  isSuggestionPanelActive,
  backdropTarget,
}: UseSearchForegroundBottomNavVisualRuntimeArgs): SearchForegroundBottomNavVisualRuntime => {
  const surfaceVisualPolicy = useSearchSurfaceRuntimeSelector(
    selectSearchSurfaceVisualPolicy,
    areSearchSurfaceVisualPoliciesEqual
  );
  const isTransitionOwnedResultsExit =
    surfaceVisualPolicy.phase === 'results_dismissing' &&
    !(
      surfaceVisualPolicy.canReleasePersistentPolls &&
      surfaceVisualPolicy.bottomBandOwner === 'persistent_polls'
    );
  const isPersistentPollHandoffCommitted =
    surfaceVisualPolicy.phase === 'results_dismissing' &&
    surfaceVisualPolicy.canReleasePersistentPolls &&
    surfaceVisualPolicy.bottomBandOwner === 'persistent_polls';
  const isSearchResultsSurfaceOwner =
    surfaceVisualPolicy.bottomBandOwner === 'results_header' ||
    surfaceVisualPolicy.sheetClipMode === 'animatedSearchTransition';
  const isResultsClosing =
    searchSheetContentLaneKind === 'results_closing' || isTransitionOwnedResultsExit;
  const shouldHideBottomNavForSearchResultsMotion =
    isSearchOverlay &&
    inputMode !== 'editing' &&
    (backdropTarget === 'results' || isSearchResultsSurfaceOwner) &&
    surfaceVisualPolicy.phase !== 'results_dismissing' &&
    !isPersistentPollHandoffCommitted;
  const shouldStartBottomNavHiddenForResultsMotion = shouldHideBottomNavForSearchResultsMotion;
  const shouldHideBottomNavForSuggestionSurface = isSuggestionPanelActive;
  // Any scene can request the nav-push transition via the shareable intent registry
  // (e.g. the poll-detail thread). Reuses this exact motion + sheet-grow.
  const hasExternalNavHideIntent = useHasNavHideIntent();
  const shouldHideBottomNavForMotion =
    shouldHideBottomNavForSearchResultsMotion ||
    shouldHideBottomNavForSuggestionSurface ||
    hasExternalNavHideIntent;
  // A scene riding the shareable nav-push intent (e.g. poll detail) must hold the
  // animatedSearchTransition clip not just while the intent is live but THROUGH the
  // close animation — until the nav has fully slid back home. If we reverted the clip
  // the instant the intent drops, the dockedPersistentPoll hard clip would snap back to
  // the nav top while the nav is still mid-slide, flashing the map below. We latch on
  // when the intent arrives and clear it (below) once the nav settles. Scoped to the
  // intent so suggestion-surface nav hides never trip it.
  const [isExternalNavPushTransitionActive, setIsExternalNavPushTransitionActive] =
    React.useState(false);
  React.useEffect(() => {
    if (hasExternalNavHideIntent) {
      setIsExternalNavPushTransitionActive(true);
    }
  }, [hasExternalNavHideIntent]);
  const shouldHideBottomNavForRender = shouldHideBottomNavForSuggestionSurface;
  const navBarTop = navBarTopForSnaps;
  const navBarHeight = fallbackNavBarHeight;

  const bottomNavHideProgress = useSharedValue(shouldStartBottomNavHiddenForResultsMotion ? 0 : 1);
  const navBarCutoutIsHidingValue = useSharedValue(shouldStartBottomNavHiddenForResultsMotion);
  const bottomNavOpacity = useSharedValue(shouldHideBottomNavForSuggestionSurface ? 0 : 1);
  const resultsSheetVisibilityAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: shouldDimResultsSheet ? 1 - suggestionProgress.value : 1,
    }),
    [shouldDimResultsSheet]
  );
  const navMotionTarget = shouldHideBottomNavForMotion ? 'hide' : 'show';

  const markDismissBottomNavReturnReady = React.useCallback((transactionId: string) => {
    getSearchSurfaceRuntime().markBottomNavReturnReady(transactionId);
  }, []);

  useAnimatedReaction(
    () => {
      if (
        surfaceVisualPolicy.phase !== 'results_dismissing' ||
        surfaceVisualPolicy.transactionId == null ||
        surfaceVisualPolicy.bottomNavReturnReady ||
        bottomNavHideProgress.value < 0.995
      ) {
        return null;
      }
      return surfaceVisualPolicy.transactionId;
    },
    (transactionId) => {
      if (transactionId == null) {
        return;
      }
      runOnJS(markDismissBottomNavReturnReady)(transactionId);
    },
    [
      bottomNavHideProgress,
      markDismissBottomNavReturnReady,
      surfaceVisualPolicy.bottomNavReturnReady,
      surfaceVisualPolicy.phase,
      surfaceVisualPolicy.transactionId,
    ]
  );

  const commandBottomNavMotion = React.useCallback(
    (target: SearchBottomNavMotionTarget) => {
      runOnUI(commandBottomNavMotionOnUI)(bottomNavHideProgress, navBarCutoutIsHidingValue, target);
    },
    [bottomNavHideProgress, navBarCutoutIsHidingValue]
  );
  React.useEffect(
    () => registerSearchBottomNavMotionCommandSink(commandBottomNavMotion),
    [commandBottomNavMotion]
  );
  React.useLayoutEffect(() => {
    commandBottomNavMotion(shouldHideBottomNavForMotion ? 'hide' : 'show');
  }, [commandBottomNavMotion, shouldHideBottomNavForMotion]);
  React.useEffect(() => {
    bottomNavOpacity.value = withTiming(shouldHideBottomNavForRender ? 0 : 1, {
      duration: SEARCH_BOTTOM_NAV_MOTION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [bottomNavOpacity, shouldHideBottomNavForRender]);

  const bottomNavVisualProgress = useDerivedValue(() => {
    return bottomNavHideProgress.value;
  }, [bottomNavHideProgress]);

  const navSilhouetteSheetExclusionModeValue = useDerivedValue(() => {
    const baseModeValue = resolveAppRouteNavSilhouetteSheetExclusionModeValue(
      surfaceVisualPolicy.sheetClipMode
    );
    // While a scene holds the shareable nav-push intent, ride the exact clip the
    // search-results sheet uses (animatedSearchTransition): the sheet grows full-screen
    // and the dockedPersistentPoll hard clip at the nav top lifts (no hard edge / no map
    // peeking below). Only override the docked-poll base — search/results already supply
    // animatedSearchTransition, and other modes (none/static) aren't poll-surface clips.
    if (
      isExternalNavPushTransitionActive &&
      baseModeValue === APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.dockedPersistentPoll
    ) {
      return APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.animatedSearchTransition;
    }
    return baseModeValue;
  }, [surfaceVisualPolicy.sheetClipMode, isExternalNavPushTransitionActive]);
  const activeScenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);
  const navSilhouetteMotionRuntime = useAppRouteNavSilhouetteMotionRuntime({
    bottomNavHideProgress: bottomNavVisualProgress,
    navBarCutoutIsHidingValue,
    bottomNavHiddenTranslateY,
  });
  // Release the nav-push clip latch once the intent has dropped AND the nav has slid
  // fully home (navTranslateY back to 0). This is what makes the close lockstep: the
  // sheet stays full-screen, covering the map, until the nav is in place underneath it,
  // then the docked-poll hard clip resumes with nothing to flash.
  useAnimatedReaction(
    () => hasExternalNavHideIntent || navSilhouetteMotionRuntime.navTranslateY.value > 0.5,
    (stillActive, previous) => {
      if (!stillActive && stillActive !== previous) {
        runOnJS(setIsExternalNavPushTransitionActive)(false);
      }
    },
    [hasExternalNavHideIntent]
  );
  const bottomNavMotionRuntime = React.useMemo(
    () => ({
      navOpacity: bottomNavOpacity,
      navTranslateY: navSilhouetteMotionRuntime.navTranslateY,
    }),
    [bottomNavOpacity, navSilhouetteMotionRuntime.navTranslateY]
  );
  const resolvedNavBarHeightValue = useDerivedValue(() => navBarHeight, [navBarHeight]);
  const bottomNavHiddenTranslateYValue = useDerivedValue(
    () => bottomNavHiddenTranslateY,
    [bottomNavHiddenTranslateY]
  );
  const navSilhouetteSheetMaskHeight = useAppRouteNavSilhouetteSheetMaskHeightValue({
    sheetExclusionModeValue: navSilhouetteSheetExclusionModeValue,
    resolvedNavBarHeightValue,
    bottomNavHiddenTranslateYValue,
    navTranslateYValue: navSilhouetteMotionRuntime.navTranslateY,
    navBarCutoutProgressValue: navSilhouetteMotionRuntime.navBarCutoutProgress,
    navBarCutoutHidingProgressValue: navSilhouetteMotionRuntime.navBarCutoutHidingProgress,
    navBarCutoutIsHidingValue,
  });
  const navSilhouetteSheetBodyExclusionHeight =
    useAppRouteNavSilhouetteSheetBodyExclusionHeightValue({
      sheetExclusionModeValue: navSilhouetteSheetExclusionModeValue,
      resolvedNavBarHeightValue,
      bottomNavHiddenTranslateYValue,
      navTranslateYValue: navSilhouetteMotionRuntime.navTranslateY,
      navBarCutoutProgressValue: navSilhouetteMotionRuntime.navBarCutoutProgress,
      navBarCutoutHidingProgressValue: navSilhouetteMotionRuntime.navBarCutoutHidingProgress,
      navBarCutoutIsHidingValue,
    });
  const logNavCutoutLockstepSample = React.useCallback(
    (sample: SearchNavCutoutLockstepProofSample) => {
      if (!isPerfScenarioAttributionActive(activeScenarioConfig)) {
        return;
      }
      const startedAtMs = getPerfScenarioWorkNow();
      logPerfScenarioAttributionEvent('VisualReadiness', activeScenarioConfig, {
        event: 'nav_cutout_lockstep_contract',
        backdropTarget,
        bottomNavMotionDurationMs: SEARCH_BOTTOM_NAV_MOTION_DURATION_MS,
        bottomNavMotionEasing: 'outCubic',
        expectedCutoutFormula: 'appRouteNavSilhouetteAuthority.inverseSheetMaskProjection',
        expectedNavCutout: sample.expectedNavCutout,
        expectedSheetBodyExclusionHeight: sample.expectedSheetBodyExclusionHeight,
        expectedSheetMaskHeight: sample.expectedSheetMaskHeight,
        expectedVisiblePaintedHeight: sample.expectedVisiblePaintedHeight,
        groupedNavChromeMaskContainer: true,
        hideLead: sample.hideLead,
        isResultsClosing,
        navAndCutoutShareProgress: true,
        navCutoutProofEdge: sample.navCutoutProofEdge,
        navCutoutProofProgress: sample.navCutoutProofProgress,
        navBarCutoutHidingProgress: sample.navBarCutoutHidingProgress,
        navBarCutoutHidingProgressSource: '1 - bottomNavVisualProgress',
        navBarCutoutIsHiding: sample.navBarCutoutIsHiding,
        navBarCutoutIsHidingSource: 'boolean',
        navBarCutoutProgress: sample.navBarCutoutProgress,
        navBarExtraTop: sample.navBarExtraTop,
        navBarHeight: sample.navBarHeight,
        navBarHiddenTranslateY: sample.navBarHiddenTranslateY,
        navHiddenTranslateCoversSilhouette: sample.navBarHiddenTranslateY >= sample.navBarHeight,
        navCutoutProgressSource: 'bottomNavVisualProgress',
        navMaskMovesWithChrome: true,
        navMotionTarget,
        navReturnProgressSource: 'bottomNavTiming',
        navTranslateY: sample.navTranslateY,
        navSilhouetteMaterial: 'frosted',
        navSilhouetteSheetMaskUsesInversePath: true,
        navBodyClipSource: 'navSilhouetteRuntime.physicalSheetBodyExclusionHeight',
        navBodySamplesMapOnly: 'pixel_contract_required',
        cutoutSamplesSheet: 'pixel_contract_required',
        sheetClippedFromNavBody: true,
        singleNavSilhouetteHost: true,
        noMapThroughNavSilhouetteOverlap: false,
        loadingResultsSettledSheetExclusionMode: isPersistentPollHandoffCommitted
          ? 'dockedPersistentPoll applies committed inverse nav silhouette mask'
          : 'animatedSearchTransition projects inverse sheet mask from nav silhouette',
        searchSurfaceBottomBandOwner: surfaceVisualPolicy.bottomBandOwner,
        searchSurfaceCanReleasePersistentPolls: surfaceVisualPolicy.canReleasePersistentPolls,
        searchSurfacePhase: surfaceVisualPolicy.phase,
        searchSurfacePersistentPollHandoffCommitted: isPersistentPollHandoffCommitted,
        sheetExclusionMode: sample.sheetExclusionMode,
        sheetClipUsesNavProgress: true,
        sheetClipUsesSilhouettePath: true,
        sheetMotionSource: 'routeSheetMotion',
        shouldHideBottomNavForSearchResultsMotion,
        shouldStartBottomNavHiddenForResultsMotion,
      });
      logPerfScenarioWorkSpan({
        owner: 'nav_cutout_lockstep_sample_log',
        path: isResultsClosing ? 'dismiss' : 'submit',
        startedAtMs,
        details: {
          navCutoutProofProgress: sample.navCutoutProofProgress,
          searchSurfacePhase: surfaceVisualPolicy.phase,
          sheetExclusionMode: sample.sheetExclusionMode,
        },
      });
    },
    [
      activeScenarioConfig,
      backdropTarget,
      isResultsClosing,
      isPersistentPollHandoffCommitted,
      navMotionTarget,
      shouldHideBottomNavForSearchResultsMotion,
      shouldStartBottomNavHiddenForResultsMotion,
      surfaceVisualPolicy.bottomBandOwner,
      surfaceVisualPolicy.canReleasePersistentPolls,
      surfaceVisualPolicy.phase,
    ]
  );

  useAnimatedReaction(
    () => {
      const sample = resolveRoundedAppRouteNavSilhouetteClipSample(
        resolveAppRouteNavSilhouetteClipSample({
          mode: surfaceVisualPolicy.sheetClipMode,
          navBarHeight,
          bottomNavHiddenTranslateY,
          navTranslateY: navSilhouetteMotionRuntime.navTranslateY.value,
          navBarCutoutProgress: navSilhouetteMotionRuntime.navBarCutoutProgress.value,
          navBarCutoutHidingProgress: navSilhouetteMotionRuntime.navBarCutoutHidingProgress.value,
          navBarCutoutIsHiding: navBarCutoutIsHidingValue.value,
        })
      );
      const navCutoutProofProgress = sample.navBarCutoutIsHiding
        ? sample.navBarCutoutHidingProgress
        : sample.navBarCutoutProgress;
      const isSubmitHideMidpoint =
        sample.navBarCutoutIsHiding &&
        surfaceVisualPolicy.bottomBandOwner === 'results_header' &&
        surfaceVisualPolicy.sheetClipMode === 'animatedSearchTransition' &&
        surfaceVisualPolicy.phase !== 'idle' &&
        navCutoutProofProgress >= 0.25 &&
        navCutoutProofProgress <= 0.75;
      const isDismissPreBoundaryReturn =
        !sample.navBarCutoutIsHiding &&
        isResultsClosing &&
        surfaceVisualPolicy.phase === 'results_dismissing' &&
        surfaceVisualPolicy.bottomBandOwner === 'results_header' &&
        !surfaceVisualPolicy.canReleasePersistentPolls;
      const isPersistentPollHandoff =
        !sample.navBarCutoutIsHiding &&
        surfaceVisualPolicy.phase === 'results_dismissing' &&
        surfaceVisualPolicy.bottomBandOwner === 'persistent_polls' &&
        surfaceVisualPolicy.canReleasePersistentPolls &&
        navCutoutProofProgress >= 0.9;
      if (!isSubmitHideMidpoint && !isDismissPreBoundaryReturn && !isPersistentPollHandoff) {
        return null;
      }
      return {
        ...sample,
        isResultsClosingSample: isResultsClosing,
        navCutoutProofEdge: isSubmitHideMidpoint
          ? ('submit_hide_midpoint' as const)
          : isDismissPreBoundaryReturn
            ? ('dismiss_pre_boundary_return' as const)
            : ('persistent_poll_handoff' as const),
        navCutoutProofProgress,
        searchSurfaceCanReleasePersistentPollsSample: surfaceVisualPolicy.canReleasePersistentPolls,
        searchSurfacePhaseSample: surfaceVisualPolicy.phase,
        searchSurfacePersistentPollHandoffCommittedSample: isPersistentPollHandoffCommitted,
      };
    },
    (next, previous) => {
      if (next == null) {
        return;
      }
      if (
        previous != null &&
        next.navCutoutProofEdge === previous.navCutoutProofEdge &&
        next.navBarCutoutIsHiding === previous.navBarCutoutIsHiding &&
        next.isResultsClosingSample === previous.isResultsClosingSample &&
        next.searchSurfacePhaseSample === previous.searchSurfacePhaseSample &&
        next.searchSurfaceCanReleasePersistentPollsSample ===
          previous.searchSurfaceCanReleasePersistentPollsSample &&
        next.searchSurfacePersistentPollHandoffCommittedSample ===
          previous.searchSurfacePersistentPollHandoffCommittedSample
      ) {
        return;
      }
      runOnJS(logNavCutoutLockstepSample)(next);
    },
    [
      bottomNavHiddenTranslateY,
      logNavCutoutLockstepSample,
      navBarHeight,
      navSilhouetteMotionRuntime.navBarCutoutHidingProgress,
      navSilhouetteMotionRuntime.navBarCutoutProgress,
      navSilhouetteMotionRuntime.navTranslateY,
      isResultsClosing,
      isPersistentPollHandoffCommitted,
      isSearchResultsSurfaceOwner,
      shouldHideBottomNavForSearchResultsMotion,
      surfaceVisualPolicy.canReleasePersistentPolls,
      surfaceVisualPolicy.bottomBandOwner,
      surfaceVisualPolicy.phase,
      surfaceVisualPolicy.sheetClipMode,
    ]
  );

  return {
    navBarTop,
    navBarHeight,
    bottomNavHiddenTranslateY,
    resultsSheetVisibilityAnimatedStyle,
    shouldHideBottomNavForRender,
    navBarCutoutIsHiding: shouldHideBottomNavForMotion,
    navBarCutoutHidingProgress: navSilhouetteMotionRuntime.navBarCutoutHidingProgress,
    navBarCutoutProgress: navSilhouetteMotionRuntime.navBarCutoutProgress,
    navTranslateY: navSilhouetteMotionRuntime.navTranslateY,
    navSilhouetteSheetBodyExclusionHeight,
    navSilhouetteSheetMaskHeight,
    navSilhouetteSheetExclusionModeValue,
    bottomNavMotionRuntime,
  };
};
