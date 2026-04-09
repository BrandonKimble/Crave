import React from 'react';

import type { SearchRouteHostVisualState } from '../../../../overlays/searchRouteHostVisualState';
import { logger } from '../../../../utils';
import {
  areResultsPresentationReadModelsEqual,
  type ResultsPresentationReadModel,
} from './results-presentation-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

type UseSearchResultsSheetVisualRuntimeArgs = SearchRouteHostVisualState & {
  searchRuntimeBus: SearchRuntimeBus;
  shouldRenderResultsSheet: boolean;
  isRunOneChromeFreezeActive: boolean;
  isRunOnePreflightFreezeActive: boolean;
  isResponseFrameFreezeActive: boolean;
  isCloseTransitionActive: boolean;
  searchMode: 'natural' | 'shortcut' | null;
  resultsPage: number | null;
  isSearchLoading: boolean;
};

export const useSearchResultsSheetVisualRuntime = ({
  searchRuntimeBus,
  shouldRenderResultsSheet,
  isRunOneChromeFreezeActive,
  isRunOnePreflightFreezeActive,
  isResponseFrameFreezeActive,
  isCloseTransitionActive,
  searchMode,
  resultsPage,
  isSearchLoading,
  sheetTranslateY,
  resultsScrollOffset,
  resultsMomentum,
  overlayHeaderActionProgress,
  navBarHeight,
  navBarTopForSnaps,
  searchBarTop,
  snapPoints,
  closeVisualHandoffProgress,
  navBarCutoutHeight,
  navBarCutoutProgress,
  bottomNavHiddenTranslateY,
  navBarCutoutIsHiding,
}: UseSearchResultsSheetVisualRuntimeArgs) => {
  const searchSheetVisualContextValue = React.useMemo(
    () => ({
      sheetTranslateY,
      resultsScrollOffset,
      resultsMomentum,
      overlayHeaderActionProgress,
      navBarHeight,
      navBarTopForSnaps,
      searchBarTop,
      snapPoints,
      closeVisualHandoffProgress,
      navBarCutoutHeight,
      navBarCutoutProgress,
      bottomNavHiddenTranslateY,
      navBarCutoutIsHiding,
    }),
    [
      bottomNavHiddenTranslateY,
      closeVisualHandoffProgress,
      navBarHeight,
      navBarTopForSnaps,
      navBarCutoutHeight,
      navBarCutoutIsHiding,
      navBarCutoutProgress,
      overlayHeaderActionProgress,
      resultsMomentum,
      resultsScrollOffset,
      searchBarTop,
      sheetTranslateY,
      snapPoints,
    ]
  );
  const shouldFreezeSuggestionSurfaceForRunOne =
    isRunOneChromeFreezeActive || isRunOnePreflightFreezeActive || isResponseFrameFreezeActive;
  const shouldFreezeOverlayHeaderChromeForRunOne = shouldFreezeSuggestionSurfaceForRunOne;
  const shouldFreezeOverlaySheetForCloseHandoff = isCloseTransitionActive;
  const shouldFreezeBottomNavDuringShortcutLoad =
    searchMode === 'shortcut' && (resultsPage == null || resultsPage === 1) && isSearchLoading;

  const resultsSheetDiagRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      runOneHandoffPhase: state.runOneHandoffPhase,
      resultsPresentation: state.resultsPresentation,
    }),
    (left, right) =>
      left.runOneHandoffPhase === right.runOneHandoffPhase &&
      areResultsPresentationReadModelsEqual(left.resultsPresentation, right.resultsPresentation),
    ['runOneHandoffPhase', 'resultsPresentation'] as const
  );
  const resultsSheetDiagRef = React.useRef<{
    shouldRenderResultsSheet: boolean;
    shouldFreezeOverlayHeaderChromeForRunOne: boolean;
    shouldFreezeOverlaySheetForCloseHandoff: boolean;
    shouldFreezeBottomNavDuringShortcutLoad: boolean;
    runOneHandoffPhase: ReturnType<SearchRuntimeBus['getState']>['runOneHandoffPhase'];
    resultsPresentation: ResultsPresentationReadModel;
  } | null>(null);

  React.useEffect(() => {
    const nextSnapshot = {
      shouldRenderResultsSheet,
      shouldFreezeOverlayHeaderChromeForRunOne,
      shouldFreezeOverlaySheetForCloseHandoff,
      shouldFreezeBottomNavDuringShortcutLoad,
      runOneHandoffPhase: resultsSheetDiagRuntimeState.runOneHandoffPhase,
      resultsPresentation: resultsSheetDiagRuntimeState.resultsPresentation,
    };
    const previousSnapshot = resultsSheetDiagRef.current;
    if (
      previousSnapshot &&
      previousSnapshot.shouldRenderResultsSheet === nextSnapshot.shouldRenderResultsSheet &&
      previousSnapshot.shouldFreezeOverlayHeaderChromeForRunOne ===
        nextSnapshot.shouldFreezeOverlayHeaderChromeForRunOne &&
      previousSnapshot.shouldFreezeOverlaySheetForCloseHandoff ===
        nextSnapshot.shouldFreezeOverlaySheetForCloseHandoff &&
      previousSnapshot.shouldFreezeBottomNavDuringShortcutLoad ===
        nextSnapshot.shouldFreezeBottomNavDuringShortcutLoad &&
      previousSnapshot.runOneHandoffPhase === nextSnapshot.runOneHandoffPhase &&
      areResultsPresentationReadModelsEqual(
        previousSnapshot.resultsPresentation,
        nextSnapshot.resultsPresentation
      )
    ) {
      return;
    }
    logger.debug('[RESULTS-SHEET-DIAG] screenState', nextSnapshot);
    resultsSheetDiagRef.current = nextSnapshot;
  }, [
    resultsSheetDiagRuntimeState.resultsPresentation,
    resultsSheetDiagRuntimeState.runOneHandoffPhase,
    shouldFreezeBottomNavDuringShortcutLoad,
    shouldFreezeOverlayHeaderChromeForRunOne,
    shouldFreezeOverlaySheetForCloseHandoff,
    shouldRenderResultsSheet,
  ]);

  return React.useMemo(
    () => ({
      searchSheetVisualContextValue,
      shouldFreezeSuggestionSurfaceForRunOne,
      shouldFreezeOverlayHeaderChromeForRunOne,
      shouldFreezeOverlaySheetForCloseHandoff,
    }),
    [
      searchSheetVisualContextValue,
      shouldFreezeOverlayHeaderChromeForRunOne,
      shouldFreezeOverlaySheetForCloseHandoff,
      shouldFreezeSuggestionSurfaceForRunOne,
    ]
  );
};
