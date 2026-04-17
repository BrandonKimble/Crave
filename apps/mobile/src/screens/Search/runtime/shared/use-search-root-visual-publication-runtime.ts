import React from 'react';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';

import { logger } from '../../../../utils';
import type { SearchRouteHostVisualState } from '../../../../overlays/searchOverlayRouteHostContract';
import type {
  ResultsPanelVisualRuntimeModel,
  UseSearchResultsRoutePublicationArgs,
} from './search-results-panel-runtime-contract';
import type { SearchRootActionLanesRuntime } from './use-search-root-action-lanes-runtime-contract';
import type { SearchRootSuggestionRuntime } from './search-root-core-runtime-contract';
import type { SearchRootScaffoldRuntime } from './search-root-scaffold-runtime-contract';
import type { SearchRootVisualRuntime } from './search-root-visual-runtime-contract';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import {
  areResultsPresentationReadModelsEqual,
  type ResultsPresentationReadModel,
} from './results-presentation-runtime-contract';
import { useSearchChromeTransitionRuntime } from './use-search-chrome-transition-runtime';
import { useSearchCloseVisualHandoffRuntime } from './use-search-close-visual-handoff-runtime';
import { useSearchForegroundVisualRuntime } from './use-search-foreground-visual-runtime';
import { useSearchOverlayChromeSnapsRuntime } from './use-search-overlay-chrome-snaps-runtime';
import { useSearchOverlaySheetResetRuntime } from './use-search-overlay-sheet-reset-runtime';
import { useSearchRestaurantRoutePublicationRuntime } from './use-search-restaurant-route-publication-runtime';
import { useSearchRoutePanelPublicationRuntime } from './use-search-route-panel-publication-runtime';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

type SearchRootVisualPublicationSearchState = {
  resultsScrollRef: ResultsPanelVisualRuntimeModel['resultsScrollRef'];
  searchFiltersLayoutCacheRef: UseSearchResultsRoutePublicationArgs['searchFiltersLayoutCacheRef'];
  handleSearchFiltersLayoutCache: UseSearchResultsRoutePublicationArgs['handleSearchFiltersLayoutCache'];
  isSuggestionPanelActive: boolean;
  shouldDisableSearchShortcutsRef: React.MutableRefObject<boolean>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
};

type UseSearchRootVisualPublicationRuntimeArgs = {
  insetsTop: number;
  startupPollsSnapshot: UseSearchResultsRoutePublicationArgs['startupPollsSnapshot'];
  userLocation: UseSearchResultsRoutePublicationArgs['userLocation'];
  scaffoldRuntime: SearchRootScaffoldRuntime;
  sessionRuntime: SearchRootSessionRuntime;
  suggestionRuntime: SearchRootSuggestionRuntime;
  actionLanesRuntime: SearchRootActionLanesRuntime;
  resultsPresentationOwner: UseSearchResultsRoutePublicationArgs['resultsPresentationOwner'];
  searchState: SearchRootVisualPublicationSearchState;
};

export type SearchRootVisualPublicationRuntime = {
  visualRuntime: SearchRootVisualRuntime;
  shouldFreezeSuggestionSurfaceForRunOne: boolean;
  shouldFreezeOverlayHeaderChromeForRunOne: boolean;
};

export const useSearchRootVisualPublicationRuntime = ({
  insetsTop,
  startupPollsSnapshot,
  userLocation,
  scaffoldRuntime,
  sessionRuntime,
  suggestionRuntime,
  actionLanesRuntime,
  resultsPresentationOwner,
  searchState,
}: UseSearchRootVisualPublicationRuntimeArgs): SearchRootVisualPublicationRuntime => {
  const chromeTransitionConfig = useSearchOverlayChromeSnapsRuntime({
    searchBarTop: scaffoldRuntime.overlaySessionRuntime.searchBarTop,
    insetsTop,
    showSaveListOverlay: sessionRuntime.overlayCommandRuntime.showSaveListOverlay,
    showProfileOverlay: scaffoldRuntime.overlaySessionRuntime.showProfileOverlay,
    showBookmarksOverlay: scaffoldRuntime.overlaySessionRuntime.showBookmarksOverlay,
    showPollsOverlay: scaffoldRuntime.overlaySessionRuntime.showPollsOverlay,
    isSearchOverlay: scaffoldRuntime.overlaySessionRuntime.isSearchOverlay,
    isSuggestionPanelActive: searchState.isSuggestionPanelActive,
    isSearchSessionActive: sessionRuntime.runtimeFlags.isSearchSessionActive,
    isSearchLoading: sessionRuntime.runtimeFlags.isSearchLoading,
    shouldRenderResultsSheet: scaffoldRuntime.resultsSheetRuntimeOwner.shouldRenderResultsSheet,
    sheetTranslateY: scaffoldRuntime.resultsSheetRuntimeOwner.sheetTranslateY,
    snapPoints: scaffoldRuntime.resultsSheetRuntimeOwner.snapPoints,
  });

  useSearchOverlaySheetResetRuntime({
    shouldShowPollsSheet: scaffoldRuntime.overlaySessionRuntime.shouldShowPollsSheet,
    showBookmarksOverlay: scaffoldRuntime.overlaySessionRuntime.showBookmarksOverlay,
    showProfileOverlay: scaffoldRuntime.overlaySessionRuntime.showProfileOverlay,
    showSaveListOverlay: sessionRuntime.overlayCommandRuntime.showSaveListOverlay,
    setPollsSheetSnap: sessionRuntime.overlayCommandRuntime.commandActions.setPollsSheetSnap,
    setBookmarksSheetSnap:
      sessionRuntime.overlayCommandRuntime.commandActions.setBookmarksSheetSnap,
    setProfileSheetSnap: sessionRuntime.overlayCommandRuntime.commandActions.setProfileSheetSnap,
    setSaveSheetSnap: sessionRuntime.overlayCommandRuntime.commandActions.setSaveSheetSnap,
  });

  const { closeVisualHandoffProgress } = useSearchCloseVisualHandoffRuntime({
    isCloseTransitionActive: resultsPresentationOwner.shellModel.isCloseTransitionActive,
    sheetTranslateY: scaffoldRuntime.resultsSheetRuntimeOwner.sheetTranslateY,
    collapsedSnap: scaffoldRuntime.resultsSheetRuntimeOwner.snapPoints.collapsed,
    notifyCloseCollapsedBoundaryReached: () => {
      actionLanesRuntime.resultsActionRuntime.closeTransitionActions.markSearchSheetCloseCollapsedReached(
        'collapsed'
      );
    },
  });

  const overlayHeaderActionProgress = useSharedValue(0);
  const overlayChromeTransitionProgress = useSharedValue(1);
  const overlayBackdropDimProgress = useSharedValue(0);
  const shouldBridgeRouteOverlayBackdropProgress =
    scaffoldRuntime.overlaySessionRuntime.showPollsOverlay ||
    scaffoldRuntime.overlaySessionRuntime.showBookmarksOverlay ||
    scaffoldRuntime.overlaySessionRuntime.showProfileOverlay;
  const { searchChromeTransitionProgress: baseSearchChromeTransitionProgress } =
    useSearchChromeTransitionRuntime({
      expandedSnap: chromeTransitionConfig.expanded,
      middleSnap: chromeTransitionConfig.middle,
      sheetTranslateY: chromeTransitionConfig.sheetY,
    });
  useAnimatedReaction(
    () => baseSearchChromeTransitionProgress.value,
    (next) => {
      overlayChromeTransitionProgress.value = next;
    },
    [baseSearchChromeTransitionProgress, overlayChromeTransitionProgress]
  );
  useAnimatedReaction(
    () =>
      shouldBridgeRouteOverlayBackdropProgress ? null : baseSearchChromeTransitionProgress.value,
    (next) => {
      if (next == null) {
        return;
      }
      overlayBackdropDimProgress.value = 1 - next;
    },
    [
      overlayBackdropDimProgress,
      baseSearchChromeTransitionProgress,
      shouldBridgeRouteOverlayBackdropProgress,
    ]
  );
  const { searchChromeOpacity, searchChromeScale, searchBarInputAnimatedStyle } =
    useSearchChromeTransitionRuntime({
      expandedSnap: chromeTransitionConfig.expanded,
      middleSnap: chromeTransitionConfig.middle,
      sheetTranslateY: chromeTransitionConfig.sheetY,
      transitionProgressOverride: overlayChromeTransitionProgress,
    });

  const foregroundVisualRuntime = useSearchForegroundVisualRuntime({
    isSuggestionOverlayVisible: suggestionRuntime.isSuggestionOverlayVisible,
    suggestionProgress: suggestionRuntime.suggestionProgress,
    isSearchOverlay: scaffoldRuntime.overlaySessionRuntime.isSearchOverlay,
    navBarTopForSnaps: scaffoldRuntime.overlaySessionRuntime.navBarTopForSnaps,
    fallbackNavBarHeight: scaffoldRuntime.overlaySessionRuntime.navBarCutoutHeight,
    bottomNavHiddenTranslateY: scaffoldRuntime.overlaySessionRuntime.bottomNavHiddenTranslateY,
    shouldDisableSearchShortcuts: searchState.shouldDisableSearchShortcutsRef.current,
    shouldRenderSearchOverlay: scaffoldRuntime.overlaySessionRuntime.shouldRenderSearchOverlay,
    isSuggestionPanelActive: searchState.isSuggestionPanelActive,
    searchChromeOpacity,
    searchChromeScale,
    isSearchSessionActive: sessionRuntime.runtimeFlags.isSearchSessionActive,
    mapMovedSinceSearch: scaffoldRuntime.resultsSheetRuntimeLane.mapMovedSinceSearch,
    isSearchLoading: sessionRuntime.runtimeFlags.isSearchLoading,
    isLoadingMore: sessionRuntime.resultsArrivalState.isLoadingMore,
    hasResults: sessionRuntime.resultsArrivalState.hasResults,
    searchLayoutTop: suggestionRuntime.searchLayout.top,
    searchLayoutHeight: suggestionRuntime.searchLayout.height,
    insetsTop,
    shouldDimResultsSheet:
      actionLanesRuntime.resultsActionRuntime.presentationState.shouldDimResultsSheet,
    shouldSuspendResultsSheet:
      actionLanesRuntime.resultsActionRuntime.presentationState.shouldSuspendResultsSheet,
    inputMode: resultsPresentationOwner.shellModel.inputMode === 'editing' ? 'editing' : 'resting',
    searchSheetContentLaneKind: resultsPresentationOwner.shellModel.searchSheetContentLane.kind,
    searchHeaderDefaultChromeProgress: resultsPresentationOwner.shellModel.defaultChromeProgress,
    headerShortcutsVisibleTarget:
      resultsPresentationOwner.shellModel.headerVisualModel.shortcutsVisibleTarget,
    headerShortcutsInteractive:
      resultsPresentationOwner.shellModel.headerVisualModel.shortcutsInteractive,
    backdropTarget:
      resultsPresentationOwner.shellModel.backdropTarget === 'default'
        ? 'none'
        : resultsPresentationOwner.shellModel.backdropTarget,
    searchChromeTransitionProgress: overlayChromeTransitionProgress,
  });

  scaffoldRuntime.instrumentationRuntime.submitShortcutSearchRef.current = async ({
    targetTab,
    label,
    preserveSheetState,
    transitionFromDockedPolls,
  }) => {
    searchState.setQuery(label);
    await actionLanesRuntime.foregroundActionRuntime.submitRuntimeResult.submitViewportShortcut(
      targetTab,
      label,
      {
        preserveSheetState,
        transitionFromDockedPolls,
      }
    );
  };

  const visualRuntime: SearchRootVisualRuntime = {
    ...foregroundVisualRuntime,
    overlayHeaderActionProgress,
    overlayChromeTransitionProgress,
    overlayBackdropDimProgress,
    closeVisualHandoffProgress,
    searchBarInputAnimatedStyle,
  };

  const searchSheetVisualContextValue = React.useMemo<SearchRouteHostVisualState>(
    () => ({
      sheetTranslateY: scaffoldRuntime.resultsSheetRuntimeOwner.sheetTranslateY,
      resultsScrollOffset: scaffoldRuntime.resultsSheetRuntimeOwner.resultsScrollOffset,
      resultsMomentum: scaffoldRuntime.resultsSheetRuntimeOwner.resultsMomentum,
      overlayHeaderActionProgress: visualRuntime.overlayHeaderActionProgress,
      navBarHeight: visualRuntime.navBarHeight,
      navBarTopForSnaps: visualRuntime.navBarTop,
      searchBarTop: scaffoldRuntime.overlaySessionRuntime.searchBarTop,
      snapPoints: scaffoldRuntime.resultsSheetRuntimeOwner.snapPoints,
      closeVisualHandoffProgress: visualRuntime.closeVisualHandoffProgress,
      navBarCutoutHeight: scaffoldRuntime.overlaySessionRuntime.navBarCutoutHeight,
      navBarCutoutProgress: visualRuntime.navBarCutoutProgress,
      bottomNavHiddenTranslateY: scaffoldRuntime.overlaySessionRuntime.bottomNavHiddenTranslateY,
      navBarCutoutIsHiding: visualRuntime.navBarCutoutIsHiding,
    }),
    [
      scaffoldRuntime.overlaySessionRuntime.navBarCutoutHeight,
      scaffoldRuntime.overlaySessionRuntime.bottomNavHiddenTranslateY,
      scaffoldRuntime.overlaySessionRuntime.searchBarTop,
      scaffoldRuntime.resultsSheetRuntimeOwner.resultsMomentum,
      scaffoldRuntime.resultsSheetRuntimeOwner.resultsScrollOffset,
      scaffoldRuntime.resultsSheetRuntimeOwner.sheetTranslateY,
      scaffoldRuntime.resultsSheetRuntimeOwner.snapPoints,
      visualRuntime.closeVisualHandoffProgress,
      visualRuntime.navBarCutoutIsHiding,
      visualRuntime.navBarCutoutProgress,
      visualRuntime.navBarHeight,
      visualRuntime.navBarTop,
      visualRuntime.overlayHeaderActionProgress,
    ]
  );

  const shouldFreezeSuggestionSurfaceForRunOne =
    sessionRuntime.freezeGate.isRunOneChromeFreezeActive ||
    sessionRuntime.freezeGate.isRunOnePreflightFreezeActive ||
    sessionRuntime.freezeGate.isResponseFrameFreezeActive;
  const shouldFreezeOverlayHeaderChromeForRunOne = shouldFreezeSuggestionSurfaceForRunOne;
  const shouldFreezeOverlaySheetForCloseHandoff =
    resultsPresentationOwner.shellModel.isCloseTransitionActive;
  const shouldFreezeBottomNavDuringShortcutLoad =
    sessionRuntime.runtimeFlags.searchMode === 'shortcut' &&
    (sessionRuntime.resultsArrivalState.resultsPage == null ||
      sessionRuntime.resultsArrivalState.resultsPage === 1) &&
    sessionRuntime.runtimeFlags.isSearchLoading;

  const resultsSheetDiagRuntimeState = useSearchRuntimeBusSelector(
    sessionRuntime.runtimeOwner.searchRuntimeBus,
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
    runOneHandoffPhase: ReturnType<
      typeof sessionRuntime.runtimeOwner.searchRuntimeBus.getState
    >['runOneHandoffPhase'];
    resultsPresentation: ResultsPresentationReadModel;
  } | null>(null);

  React.useEffect(() => {
    const nextSnapshot = {
      shouldRenderResultsSheet: scaffoldRuntime.resultsSheetRuntimeOwner.shouldRenderResultsSheet,
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
    scaffoldRuntime.resultsSheetRuntimeOwner.shouldRenderResultsSheet,
    shouldFreezeBottomNavDuringShortcutLoad,
    shouldFreezeOverlayHeaderChromeForRunOne,
    shouldFreezeOverlaySheetForCloseHandoff,
  ]);

  const resultsPanelVisualRuntimeModel = React.useMemo<ResultsPanelVisualRuntimeModel>(
    () => ({
      resultsScrollRef: searchState.resultsScrollRef,
      shouldDisableResultsSheetInteraction:
        actionLanesRuntime.resultsActionRuntime.presentationState
          .shouldDisableResultsSheetInteraction,
      resultsWashAnimatedStyle: visualRuntime.resultsWashAnimatedStyle,
      resultsSheetVisibilityAnimatedStyle: visualRuntime.resultsSheetVisibilityAnimatedStyle,
    }),
    [
      actionLanesRuntime.resultsActionRuntime.presentationState
        .shouldDisableResultsSheetInteraction,
      searchState.resultsScrollRef,
      visualRuntime.resultsSheetVisibilityAnimatedStyle,
      visualRuntime.resultsWashAnimatedStyle,
    ]
  );
  const restaurantRouteVisualContext = React.useMemo(
    () => ({
      sheetTranslateY: searchSheetVisualContextValue.sheetTranslateY,
      resultsScrollOffset: searchSheetVisualContextValue.resultsScrollOffset,
      resultsMomentum: searchSheetVisualContextValue.resultsMomentum,
      navBarTopForSnaps: searchSheetVisualContextValue.navBarTopForSnaps,
      searchBarTop: searchSheetVisualContextValue.searchBarTop,
      overlayHeaderActionProgress: searchSheetVisualContextValue.overlayHeaderActionProgress,
      navBarCutoutHeight: searchSheetVisualContextValue.navBarCutoutHeight,
      bottomNavHiddenTranslateY: searchSheetVisualContextValue.bottomNavHiddenTranslateY,
    }),
    [
      searchSheetVisualContextValue.bottomNavHiddenTranslateY,
      searchSheetVisualContextValue.navBarCutoutHeight,
      searchSheetVisualContextValue.navBarTopForSnaps,
      searchSheetVisualContextValue.overlayHeaderActionProgress,
      searchSheetVisualContextValue.resultsMomentum,
      searchSheetVisualContextValue.resultsScrollOffset,
      searchSheetVisualContextValue.searchBarTop,
      searchSheetVisualContextValue.sheetTranslateY,
    ]
  );

  useSearchRoutePanelPublicationRuntime({
    searchRuntimeBus: sessionRuntime.runtimeOwner.searchRuntimeBus,
    resultsPresentationOwner,
    resultsSheetRuntime: scaffoldRuntime.resultsSheetRuntimeOwner,
    pollBounds: scaffoldRuntime.resultsSheetRuntimeLane.pollBounds,
    startupPollsSnapshot,
    userLocation,
    searchInteractionRef: sessionRuntime.primitives.searchInteractionRef,
    shouldDisableSearchBlur: false,
    searchFiltersLayoutCacheRef: searchState.searchFiltersLayoutCacheRef,
    handleSearchFiltersLayoutCache: searchState.handleSearchFiltersLayoutCache,
    getDishSaveHandler: sessionRuntime.overlayCommandRuntime.getDishSaveHandler,
    getRestaurantSaveHandler: sessionRuntime.overlayCommandRuntime.getRestaurantSaveHandler,
    mapQueryBudget: sessionRuntime.runtimeOwner.mapQueryBudget,
    shouldLogResultsViewability: scaffoldRuntime.instrumentationRuntime.shouldLogResultsViewability,
    onRuntimeMechanismEvent: scaffoldRuntime.instrumentationRuntime.emitRuntimeMechanismEvent,
    phaseBMaterializerRef: sessionRuntime.runtimeOwner.phaseBMaterializerRef,
    isSuggestionPanelActive: searchState.isSuggestionPanelActive,
    resultsSheetInteractionModel:
      actionLanesRuntime.resultsActionRuntime.resultsSheetInteractionModel,
    toggleOpenNow: actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.toggleOpenNow,
    toggleVotesFilter:
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.toggleVotesFilter,
    togglePriceSelector:
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.togglePriceSelector,
    stableOpenRestaurantProfileFromResults:
      actionLanesRuntime.profileActionRuntime.stableOpenRestaurantProfileFromResults,
    openScoreInfo: actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.openScoreInfo,
    shouldRenderSearchOverlay: scaffoldRuntime.overlaySessionRuntime.shouldRenderSearchOverlay,
    isForegroundEditing: resultsPresentationOwner.shellModel.inputMode === 'editing',
    resultsPanelVisualRuntimeModel,
    visualState: searchSheetVisualContextValue,
    shouldFreezeOverlaySheetForCloseHandoff,
    shouldFreezeOverlayHeaderActionForRunOne: shouldFreezeOverlayHeaderChromeForRunOne,
    overlayHeaderActionProgress: visualRuntime.overlayHeaderActionProgress,
  });

  useSearchRestaurantRoutePublicationRuntime({
    profileActionRuntime: actionLanesRuntime.profileActionRuntime,
    resultsActionRuntime: actionLanesRuntime.resultsActionRuntime,
    overlaySessionRuntime: scaffoldRuntime.overlaySessionRuntime,
    handleRestaurantSavePress: sessionRuntime.overlayCommandRuntime.handleRestaurantSavePress,
    visualContext: restaurantRouteVisualContext,
    suggestionProgress: suggestionRuntime.suggestionProgress,
  });

  return {
    visualRuntime,
    shouldFreezeSuggestionSurfaceForRunOne,
    shouldFreezeOverlayHeaderChromeForRunOne,
  };
};
