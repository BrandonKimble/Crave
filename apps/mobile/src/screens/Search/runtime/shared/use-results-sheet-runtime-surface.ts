import React from 'react';

import type { ResultsSheetRuntimeOwner } from './results-sheet-runtime-contract';
import type { ResultsSheetAnimatedStylesRuntime } from './use-results-sheet-animated-styles-runtime';
import type { ResultsSheetRuntimeModelRuntime } from './use-results-sheet-runtime-model-runtime';
import type { ResultsSheetSharedValuesRuntime } from './use-results-sheet-shared-values-runtime';
import type { ResultsSheetVisibilityActionsRuntime } from './use-results-sheet-visibility-actions-runtime';
import type { ResultsSheetVisibilityStateRuntime } from './use-results-sheet-visibility-state-runtime';

type UseResultsSheetRuntimeSurfaceArgs = {
  sharedValuesRuntime: ResultsSheetSharedValuesRuntime;
  runtimeModelRuntime: ResultsSheetRuntimeModelRuntime;
  animatedStylesRuntime: ResultsSheetAnimatedStylesRuntime;
  visibilityStateRuntime: ResultsSheetVisibilityStateRuntime;
  visibilityActionsRuntime: ResultsSheetVisibilityActionsRuntime;
};

export const useResultsSheetRuntimeSurface = ({
  sharedValuesRuntime,
  runtimeModelRuntime,
  animatedStylesRuntime,
  visibilityStateRuntime,
  visibilityActionsRuntime,
}: UseResultsSheetRuntimeSurfaceArgs): ResultsSheetRuntimeOwner =>
  React.useMemo(
    () => ({
      snapPoints: sharedValuesRuntime.snapPoints,
      panelVisible: visibilityStateRuntime.panelVisible,
      sheetState: visibilityStateRuntime.sheetState,
      sheetTranslateY: sharedValuesRuntime.sheetTranslateY,
      resultsScrollOffset: sharedValuesRuntime.resultsScrollOffset,
      resultsMomentum: sharedValuesRuntime.resultsMomentum,
      resultsSheetRuntimeModel: runtimeModelRuntime.resultsSheetRuntimeModel,
      shouldRenderResultsSheet: visibilityStateRuntime.shouldRenderResultsSheet,
      shouldRenderResultsSheetRef: visibilityStateRuntime.shouldRenderResultsSheetRef,
      headerDividerAnimatedStyle: animatedStylesRuntime.headerDividerAnimatedStyle,
      resultsContainerAnimatedStyle: animatedStylesRuntime.resultsContainerAnimatedStyle,
      animateSheetTo: visibilityActionsRuntime.animateSheetTo,
      resetResultsSheetToHidden: visibilityActionsRuntime.resetResultsSheetToHidden,
      prepareShortcutSheetTransition: visibilityActionsRuntime.prepareShortcutSheetTransition,
      handleSheetSnapChange: visibilityStateRuntime.handleSheetSnapChange,
    }),
    [
      animatedStylesRuntime,
      runtimeModelRuntime,
      sharedValuesRuntime,
      visibilityActionsRuntime,
      visibilityStateRuntime,
    ]
  );
