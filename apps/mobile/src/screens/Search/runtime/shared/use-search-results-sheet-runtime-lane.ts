import React from 'react';

import { OVERLAY_TAB_HEADER_HEIGHT } from '../../../../overlays/overlaySheetStyles';
import {
  createMapMotionPressureController,
  type MapMotionPressureController,
} from '../map/map-motion-pressure';
import { useSearchMapMovementState } from '../../hooks/use-search-map-movement-state';
import { useResultsSheetAnimatedStylesRuntime } from './use-results-sheet-animated-styles-runtime';
import { useResultsSheetRuntimeModelRuntime } from './use-results-sheet-runtime-model-runtime';
import { useResultsSheetRuntimeSurface } from './use-results-sheet-runtime-surface';
import { useResultsSheetSharedValuesRuntime } from './use-results-sheet-shared-values-runtime';
import { useResultsSheetVisibilityActionsRuntime } from './use-results-sheet-visibility-actions-runtime';
import { useResultsSheetVisibilityStateRuntime } from './use-results-sheet-visibility-state-runtime';
import { useResultsSheetVisibilitySyncRuntime } from './use-results-sheet-visibility-sync-runtime';

type UseSearchResultsSheetRuntimeLaneArgs = {
  startupPollBounds: Parameters<typeof useSearchMapMovementState>[0]['startupPollBounds'];
  latestBoundsRef: Parameters<typeof useSearchMapMovementState>[0]['latestBoundsRef'];
  viewportBoundsService: Parameters<typeof useSearchMapMovementState>[0]['viewportBoundsService'];
  mapRef: Parameters<typeof useSearchMapMovementState>[0]['mapRef'];
  searchInteractionRef: Parameters<typeof useSearchMapMovementState>[0]['searchInteractionRef'];
  anySheetDraggingRef: Parameters<typeof useSearchMapMovementState>[0]['anySheetDraggingRef'];
  lastSearchBoundsCaptureSeqRef: Parameters<
    typeof useSearchMapMovementState
  >[0]['lastSearchBoundsCaptureSeqRef'];
  shouldShowPollsSheet: Parameters<typeof useSearchMapMovementState>[0]['shouldShowPollsSheet'];
  screenHeight: number;
  searchBarTop: number;
  insetsTop: number;
  navBarTopForSnaps: number;
  initialDockedPollsArgs: {
    shouldShowDockedPollsTarget: boolean;
    pollsSheetSnap: Parameters<typeof useResultsSheetVisibilityActionsRuntime>[0]['pollsSheetSnap'];
    isDockedPollsDismissed: Parameters<
      typeof useResultsSheetVisibilityActionsRuntime
    >[0]['isDockedPollsDismissed'];
    hasUserSharedSnap: Parameters<
      typeof useResultsSheetVisibilityActionsRuntime
    >[0]['hasUserSharedSnap'];
    sharedSnap: Parameters<typeof useResultsSheetVisibilityActionsRuntime>[0]['sharedSnap'];
  };
  isSearchOverlay: Parameters<typeof useResultsSheetVisibilityStateRuntime>[0]['isSearchOverlay'];
  lastVisibleSheetStateRef: Parameters<
    typeof useResultsSheetVisibilitySyncRuntime
  >[0]['lastVisibleSheetStateRef'];
};

export const useSearchResultsSheetRuntimeLane = ({
  startupPollBounds,
  latestBoundsRef,
  viewportBoundsService,
  mapRef,
  searchInteractionRef,
  anySheetDraggingRef,
  lastSearchBoundsCaptureSeqRef,
  shouldShowPollsSheet,
  screenHeight,
  searchBarTop,
  insetsTop,
  navBarTopForSnaps,
  initialDockedPollsArgs,
  isSearchOverlay,
  lastVisibleSheetStateRef,
}: UseSearchResultsSheetRuntimeLaneArgs) => {
  const mapMotionPressureControllerRef = React.useRef<MapMotionPressureController | null>(null);
  if (mapMotionPressureControllerRef.current == null) {
    mapMotionPressureControllerRef.current = createMapMotionPressureController();
  }
  const mapMotionPressureController = mapMotionPressureControllerRef.current;

  const mapMovementState = useSearchMapMovementState({
    startupPollBounds,
    latestBoundsRef,
    viewportBoundsService,
    mapRef,
    mapMotionPressureController,
    searchInteractionRef,
    anySheetDraggingRef,
    lastSearchBoundsCaptureSeqRef,
    shouldShowPollsSheet,
  });

  const initialDockedPollsSnap = initialDockedPollsArgs.shouldShowDockedPollsTarget
    ? initialDockedPollsArgs.pollsSheetSnap !== 'hidden'
      ? initialDockedPollsArgs.pollsSheetSnap
      : initialDockedPollsArgs.hasUserSharedSnap
      ? initialDockedPollsArgs.sharedSnap
      : 'collapsed'
    : undefined;
  const initialResultsSheetPosition = initialDockedPollsSnap ?? 'hidden';
  const initialResultsPanelVisible = initialResultsSheetPosition !== 'hidden';

  const sharedValuesRuntime = useResultsSheetSharedValuesRuntime({
    screenHeight,
    searchBarTop,
    insetsTop,
    navBarTopForSnaps,
    overlayTabHeaderHeight: OVERLAY_TAB_HEADER_HEIGHT,
    initialResultsSheetPosition,
    initialResultsPanelVisible,
  });
  const runtimeModelRuntime = useResultsSheetRuntimeModelRuntime({
    sharedValuesRuntime,
  });
  const animatedStylesRuntime = useResultsSheetAnimatedStylesRuntime({
    sharedValuesRuntime,
  });
  const visibilityStateRuntime = useResultsSheetVisibilityStateRuntime({
    isSearchOverlay,
    initialResultsSheetPosition,
    initialResultsPanelVisible,
  });
  const visibilityActionsRuntime = useResultsSheetVisibilityActionsRuntime({
    isSearchOverlay,
    shouldShowDockedPollsTarget: initialDockedPollsArgs.shouldShowDockedPollsTarget,
    pollsSheetSnap: initialDockedPollsArgs.pollsSheetSnap,
    isDockedPollsDismissed: initialDockedPollsArgs.isDockedPollsDismissed,
    hasUserSharedSnap: initialDockedPollsArgs.hasUserSharedSnap,
    sharedSnap: initialDockedPollsArgs.sharedSnap,
    sheetLayoutRuntime: {
      resultsSheetRuntimeModel: runtimeModelRuntime.resultsSheetRuntimeModel,
      setSheetTranslateYTo: sharedValuesRuntime.setSheetTranslateYTo,
    },
    visibilityStateRuntime,
  });

  useResultsSheetVisibilitySyncRuntime({
    isSearchOverlay,
    shouldShowDockedPollsTarget: initialDockedPollsArgs.shouldShowDockedPollsTarget,
    lastVisibleSheetStateRef,
    navBarTopForSnaps,
    sheetLayoutRuntime: {
      setSheetTranslateYTo: sharedValuesRuntime.setSheetTranslateYTo,
    },
    visibilityStateRuntime,
    visibilityActionsRuntime,
  });

  const resultsSheetRuntimeOwner = useResultsSheetRuntimeSurface({
    sharedValuesRuntime,
    runtimeModelRuntime,
    animatedStylesRuntime,
    visibilityStateRuntime,
    visibilityActionsRuntime,
  });

  return {
    mapMotionPressureController,
    ...mapMovementState,
    resultsSheetRuntimeOwner,
  };
};
