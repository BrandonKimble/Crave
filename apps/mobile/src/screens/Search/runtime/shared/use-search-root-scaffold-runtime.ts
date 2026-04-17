import React from 'react';
import { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';

import { OVERLAY_TAB_HEADER_HEIGHT } from '../../../../overlays/overlaySheetStyles';
import { useBottomSheetRuntimeModel } from '../../../../overlays/useBottomSheetRuntime';
import { SCREEN_HEIGHT } from '../../constants/search';
import { useSearchMapMovementState } from '../../hooks/use-search-map-movement-state';
import {
  createMapMotionPressureController,
  type MapMotionPressureController,
} from '../map/map-motion-pressure';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import {
  type SearchBottomNavRuntime,
  type SearchOverlayStoreRuntime,
  type SearchRootScaffoldRuntime,
} from './search-root-scaffold-runtime-contract';
import { useResultsSheetSharedValuesRuntime } from './use-results-sheet-shared-values-runtime';
import { useResultsSheetVisibilityActionsRuntime } from './use-results-sheet-visibility-actions-runtime';
import { useResultsSheetVisibilityStateRuntime } from './use-results-sheet-visibility-state-runtime';
import { useResultsSheetVisibilitySyncRuntime } from './use-results-sheet-visibility-sync-runtime';
import { useSearchRuntimeInstrumentationRuntime } from './use-search-runtime-instrumentation-runtime';

type RootPrimitivesRuntime = {
  mapState: {
    mapRef: Parameters<typeof useSearchMapMovementState>[0]['mapRef'];
  };
  searchState: {
    isSuggestionPanelActive: boolean;
    isAutocompleteSuppressed: boolean;
  };
};

type UseSearchRootScaffoldRuntimeArgs = {
  insetsTop: number;
  startupPollBounds: Parameters<typeof useSearchMapMovementState>[0]['startupPollBounds'];
  overlayStoreRuntime: SearchOverlayStoreRuntime;
  routeSessionRuntime: ReturnType<
    typeof import('../../../../overlays/useSearchRouteSessionController').useSearchRouteSessionController
  >;
  bottomNavRuntime: SearchBottomNavRuntime;
  rootPrimitivesRuntime: RootPrimitivesRuntime;
  rootSessionRuntime: SearchRootSessionRuntime;
};

export const useSearchRootScaffoldRuntime = ({
  insetsTop,
  startupPollBounds,
  overlayStoreRuntime,
  routeSessionRuntime,
  bottomNavRuntime,
  rootPrimitivesRuntime,
  rootSessionRuntime,
}: UseSearchRootScaffoldRuntimeArgs): SearchRootScaffoldRuntime => {
  const shouldShowDockedPollsTarget =
    overlayStoreRuntime.isSearchOverlay &&
    !rootPrimitivesRuntime.searchState.isSuggestionPanelActive &&
    !rootSessionRuntime.runtimeFlags.isSearchSessionActive &&
    !rootSessionRuntime.runtimeFlags.isSearchLoading &&
    !routeSessionRuntime.isSearchOriginRestorePending &&
    !rootSessionRuntime.overlayCommandRuntime.commandState.isDockedPollsDismissed;
  const shouldShowDockedPolls = shouldShowDockedPollsTarget;
  const shouldShowPollsSheet = shouldShowDockedPolls;
  const transitionController = rootSessionRuntime.overlayCommandRuntime.transitionController;

  React.useEffect(() => {
    if (!transitionController.isNavRestorePending()) {
      return;
    }
    if (!overlayStoreRuntime.isSearchOverlay) {
      transitionController.setNavRestorePending(false);
      return;
    }
    if (!shouldShowDockedPollsTarget) {
      return;
    }
    if (rootSessionRuntime.overlayCommandRuntime.commandState.pollsSheetSnap === 'hidden') {
      return;
    }
    transitionController.setNavRestorePending(false);
  }, [
    overlayStoreRuntime.isSearchOverlay,
    rootSessionRuntime.overlayCommandRuntime.commandState.pollsSheetSnap,
    shouldShowDockedPollsTarget,
    transitionController,
  ]);

  const shouldRenderSearchOverlay =
    overlayStoreRuntime.isSearchOverlay ||
    shouldShowPollsSheet ||
    overlayStoreRuntime.showBookmarksOverlay ||
    overlayStoreRuntime.showProfileOverlay ||
    rootSessionRuntime.overlayCommandRuntime.showSaveListOverlay;

  const overlaySessionRuntime = React.useMemo(
    () => ({
      ...overlayStoreRuntime,
      ...routeSessionRuntime,
      ...bottomNavRuntime,
      shouldShowDockedPollsTarget,
      shouldShowDockedPolls,
      shouldShowPollsSheet,
      shouldRenderSearchOverlay,
    }),
    [
      bottomNavRuntime,
      overlayStoreRuntime,
      routeSessionRuntime,
      shouldRenderSearchOverlay,
      shouldShowDockedPolls,
      shouldShowDockedPollsTarget,
      shouldShowPollsSheet,
    ]
  );

  const mapMotionPressureControllerRef = React.useRef<MapMotionPressureController | null>(null);
  if (mapMotionPressureControllerRef.current == null) {
    mapMotionPressureControllerRef.current = createMapMotionPressureController();
  }
  const mapMotionPressureController = mapMotionPressureControllerRef.current;

  const resultsSheetRuntimeLane = {
    mapMotionPressureController,
    ...useSearchMapMovementState({
      startupPollBounds,
      latestBoundsRef: rootSessionRuntime.runtimeOwner.latestBoundsRef,
      viewportBoundsService: rootSessionRuntime.runtimeOwner.viewportBoundsService,
      mapRef: rootPrimitivesRuntime.mapState.mapRef,
      mapMotionPressureController,
      searchInteractionRef: rootSessionRuntime.primitives.searchInteractionRef,
      anySheetDraggingRef: rootSessionRuntime.primitives.anySheetDraggingRef,
      lastSearchBoundsCaptureSeqRef: rootSessionRuntime.primitives.lastSearchBoundsCaptureSeqRef,
      shouldShowPollsSheet: overlaySessionRuntime.shouldShowPollsSheet,
    }),
  };

  const initialDockedPollsSnap = overlaySessionRuntime.shouldShowDockedPollsTarget
    ? rootSessionRuntime.overlayCommandRuntime.commandState.pollsSheetSnap !== 'hidden'
      ? rootSessionRuntime.overlayCommandRuntime.commandState.pollsSheetSnap
      : rootSessionRuntime.sharedSnapState.hasUserSharedSnap
        ? rootSessionRuntime.sharedSnapState.sharedSnap
        : 'collapsed'
    : undefined;
  const initialResultsSheetPosition = initialDockedPollsSnap ?? 'hidden';
  const initialResultsPanelVisible = initialResultsSheetPosition !== 'hidden';

  const resultsSheetSharedValuesRuntime = useResultsSheetSharedValuesRuntime({
    screenHeight: SCREEN_HEIGHT,
    searchBarTop: overlaySessionRuntime.searchBarTop,
    insetsTop,
    navBarTopForSnaps: overlaySessionRuntime.navBarTopForSnaps,
    overlayTabHeaderHeight: OVERLAY_TAB_HEADER_HEIGHT,
    initialResultsSheetPosition,
    initialResultsPanelVisible,
  });
  const resultsSheetRuntimeModel = useBottomSheetRuntimeModel({
    presentationStateOverride: {
      sheetY: resultsSheetSharedValuesRuntime.sheetTranslateY,
      scrollOffset: resultsSheetSharedValuesRuntime.resultsScrollOffset,
      momentumFlag: resultsSheetSharedValuesRuntime.resultsMomentum,
    },
  });
  const headerDividerAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: interpolate(
        resultsSheetSharedValuesRuntime.resultsScrollOffset.value,
        [0, 24],
        [0, 1],
        Extrapolation.CLAMP
      ),
    }),
    [resultsSheetSharedValuesRuntime.resultsScrollOffset]
  );
  const resultsContainerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: resultsSheetSharedValuesRuntime.sheetTranslateY.value }],
  }));
  const resultsSheetVisibilityStateRuntime = useResultsSheetVisibilityStateRuntime({
    isSearchOverlay: overlaySessionRuntime.isSearchOverlay,
    initialResultsSheetPosition,
    initialResultsPanelVisible,
  });
  const resultsSheetVisibilityActionsRuntime = useResultsSheetVisibilityActionsRuntime({
    isSearchOverlay: overlaySessionRuntime.isSearchOverlay,
    shouldShowDockedPollsTarget: overlaySessionRuntime.shouldShowDockedPollsTarget,
    pollsSheetSnap: rootSessionRuntime.overlayCommandRuntime.commandState.pollsSheetSnap,
    isDockedPollsDismissed:
      rootSessionRuntime.overlayCommandRuntime.commandState.isDockedPollsDismissed,
    hasUserSharedSnap: rootSessionRuntime.sharedSnapState.hasUserSharedSnap,
    sharedSnap: rootSessionRuntime.sharedSnapState.sharedSnap,
    sheetLayoutRuntime: {
      resultsSheetRuntimeModel,
      setSheetTranslateYTo: resultsSheetSharedValuesRuntime.setSheetTranslateYTo,
    },
    visibilityStateRuntime: resultsSheetVisibilityStateRuntime,
  });
  useResultsSheetVisibilitySyncRuntime({
    isSearchOverlay: overlaySessionRuntime.isSearchOverlay,
    shouldShowDockedPollsTarget: overlaySessionRuntime.shouldShowDockedPollsTarget,
    lastVisibleSheetStateRef: rootSessionRuntime.primitives.lastVisibleSheetStateRef,
    navBarTopForSnaps: overlaySessionRuntime.navBarTopForSnaps,
    sheetLayoutRuntime: {
      setSheetTranslateYTo: resultsSheetSharedValuesRuntime.setSheetTranslateYTo,
    },
    visibilityStateRuntime: resultsSheetVisibilityStateRuntime,
    visibilityActionsRuntime: resultsSheetVisibilityActionsRuntime,
  });
  const resultsSheetRuntimeOwner = React.useMemo(
    () => ({
      snapPoints: resultsSheetSharedValuesRuntime.snapPoints,
      panelVisible: resultsSheetVisibilityStateRuntime.panelVisible,
      sheetState: resultsSheetVisibilityStateRuntime.sheetState,
      sheetTranslateY: resultsSheetSharedValuesRuntime.sheetTranslateY,
      resultsScrollOffset: resultsSheetSharedValuesRuntime.resultsScrollOffset,
      resultsMomentum: resultsSheetSharedValuesRuntime.resultsMomentum,
      resultsSheetRuntimeModel,
      shouldRenderResultsSheet: resultsSheetVisibilityStateRuntime.shouldRenderResultsSheet,
      shouldRenderResultsSheetRef: resultsSheetVisibilityStateRuntime.shouldRenderResultsSheetRef,
      headerDividerAnimatedStyle,
      resultsContainerAnimatedStyle,
      animateSheetTo: resultsSheetVisibilityActionsRuntime.animateSheetTo,
      resetResultsSheetToHidden: resultsSheetVisibilityActionsRuntime.resetResultsSheetToHidden,
      prepareShortcutSheetTransition:
        resultsSheetVisibilityActionsRuntime.prepareShortcutSheetTransition,
      handleSheetSnapChange: resultsSheetVisibilityStateRuntime.handleSheetSnapChange,
    }),
    [
      headerDividerAnimatedStyle,
      resultsContainerAnimatedStyle,
      resultsSheetRuntimeModel,
      resultsSheetSharedValuesRuntime,
      resultsSheetVisibilityActionsRuntime,
      resultsSheetVisibilityStateRuntime,
    ]
  );
  const instrumentationRuntime = useSearchRuntimeInstrumentationRuntime({
    getPerfNow: rootSessionRuntime.primitives.getPerfNow,
    roundPerfValue: (value: number): number => Math.round(value * 10) / 10,
    searchSessionController: rootSessionRuntime.runtimeOwner.searchSessionController,
    mapQueryBudget: rootSessionRuntime.runtimeOwner.mapQueryBudget,
    searchMode: rootSessionRuntime.runtimeFlags.searchMode,
    isSearchLoading: rootSessionRuntime.runtimeFlags.isSearchLoading,
    isLoadingMore: rootSessionRuntime.resultsArrivalState.isLoadingMore,
    isRunOneHandoffActive: rootSessionRuntime.freezeGate.isRun1HandoffActive,
    resultsRequestKey: rootSessionRuntime.resultsArrivalState.resultsRequestKey,
    searchInteractionRef: rootSessionRuntime.primitives.searchInteractionRef,
    isInitialCameraReady: rootSessionRuntime.mapBootstrapRuntime.isInitialCameraReady,
    runTimeoutMs: 45000,
    settleQuietPeriodMs: 320,
    searchRuntimeBus: rootSessionRuntime.runtimeOwner.searchRuntimeBus,
    runtimeWorkSchedulerRef: rootSessionRuntime.runtimeOwner.runtimeWorkSchedulerRef,
    runOneHandoffCoordinatorRef: rootSessionRuntime.runtimeOwner
      .runOneHandoffCoordinatorRef as Parameters<
      typeof useSearchRuntimeInstrumentationRuntime
    >[0]['runOneHandoffCoordinatorRef'],
    runOneCommitSpanPressureByOperationRef:
      rootSessionRuntime.primitives.runOneCommitSpanPressureByOperationRef,
    isSearchRequestLoadingRef: rootSessionRuntime.runtimeFlags.isSearchRequestLoadingRef,
    readRuntimeMemoryDiagnostics: rootSessionRuntime.primitives.readRuntimeMemoryDiagnostics,
    isSearchSessionActive: rootSessionRuntime.runtimeFlags.isSearchSessionActive,
    isAutocompleteSuppressed: rootPrimitivesRuntime.searchState.isAutocompleteSuppressed,
    resultsPage: rootSessionRuntime.resultsArrivalState.resultsPage,
    isSearchOverlay: overlaySessionRuntime.isSearchOverlay,
    rootOverlay: overlaySessionRuntime.rootOverlay,
    activeOverlayKey: overlaySessionRuntime.activeOverlayKey,
  });

  return {
    overlaySessionRuntime,
    resultsSheetRuntimeLane,
    resultsSheetRuntimeOwner,
    instrumentationRuntime,
  };
};
