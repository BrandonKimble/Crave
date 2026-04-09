import type {
  SearchRootVisualRuntimeArgsRuntime,
  UseSearchRootVisualPublicationArgsRuntimeArgs,
} from './use-search-root-visual-publication-args-runtime-contract';

export const useSearchRootVisualRuntimeArgsRuntime = ({
  insets,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  sessionActionRuntime,
  presentationState,
}: UseSearchRootVisualPublicationArgsRuntimeArgs): SearchRootVisualRuntimeArgsRuntime => {
  const {
    runtimeFlags: { isSearchSessionActive, isSearchLoading },
  } = rootSessionRuntime;
  const {
    searchState: { shouldDisableSearchShortcutsRef, isSuggestionPanelActive },
  } = rootPrimitivesRuntime;
  const { isSuggestionOverlayVisible, suggestionProgress, searchLayout } = rootSuggestionRuntime;
  const {
    overlaySessionRuntime: {
      isSearchOverlay,
      showBookmarksOverlay,
      showPollsOverlay,
      showProfileOverlay,
      searchBarTop,
      navBarTopForSnaps,
      bottomNavHiddenTranslateY,
      navBarCutoutHeight,
      shouldShowPollsSheet,
      shouldRenderSearchOverlay,
    },
    resultsSheetRuntimeLane: { mapMovedSinceSearch },
    resultsSheetRuntimeOwner,
    instrumentationRuntime: { submitShortcutSearchRef },
  } = rootScaffoldRuntime;
  const {
    requestPresentationFlowRuntime: {
      requestPresentationRuntime: { resultsPresentationOwner },
    },
  } = requestLaneRuntime;
  const { submitRuntimeResult } = sessionActionRuntime;
  const {
    shellModel,
    closeTransitionActions: { markSearchSheetCloseCollapsedReached },
  } = resultsPresentationOwner;

  return {
    visualRuntimeArgs: {
      overlayChromeSnapsArgs: {
        searchBarTop,
        insetsTop: insets.top,
        showSaveListOverlay: rootSessionRuntime.overlayCommandRuntime.showSaveListOverlay,
        showProfileOverlay,
        showBookmarksOverlay,
        showPollsOverlay,
        isSearchOverlay,
        isSuggestionPanelActive,
        isSearchSessionActive,
        isSearchLoading,
        shouldRenderResultsSheet: resultsSheetRuntimeOwner.shouldRenderResultsSheet,
        sheetTranslateY: resultsSheetRuntimeOwner.sheetTranslateY,
        snapPoints: resultsSheetRuntimeOwner.snapPoints,
      },
      overlaySheetResetArgs: {
        shouldShowPollsSheet,
        showBookmarksOverlay,
        showProfileOverlay,
        showSaveListOverlay: rootSessionRuntime.overlayCommandRuntime.showSaveListOverlay,
        setPollsSheetSnap:
          rootSessionRuntime.overlayCommandRuntime.commandActions.setPollsSheetSnap,
        setBookmarksSheetSnap:
          rootSessionRuntime.overlayCommandRuntime.commandActions.setBookmarksSheetSnap,
        setProfileSheetSnap:
          rootSessionRuntime.overlayCommandRuntime.commandActions.setProfileSheetSnap,
        setSaveSheetSnap: rootSessionRuntime.overlayCommandRuntime.commandActions.setSaveSheetSnap,
      },
      closeVisualHandoffArgs: {
        isCloseTransitionActive: shellModel.isCloseTransitionActive,
        sheetTranslateY: resultsSheetRuntimeOwner.sheetTranslateY,
        collapsedSnap: resultsSheetRuntimeOwner.snapPoints.collapsed,
      },
      notifyCloseCollapsedBoundaryReached: () => {
        markSearchSheetCloseCollapsedReached('collapsed');
      },
      foregroundVisualArgs: {
        isSuggestionOverlayVisible,
        suggestionProgress,
        isSearchOverlay,
        navBarTopForSnaps,
        fallbackNavBarHeight: navBarCutoutHeight,
        bottomNavHiddenTranslateY,
        shouldDisableSearchShortcuts: shouldDisableSearchShortcutsRef.current,
        shouldRenderSearchOverlay,
        isSuggestionPanelActive,
        chromeTransitionExpanded: resultsSheetRuntimeOwner.snapPoints.expanded,
        chromeTransitionMiddle: resultsSheetRuntimeOwner.snapPoints.middle,
        sheetTranslateY: resultsSheetRuntimeOwner.sheetTranslateY,
        isSearchSessionActive,
        mapMovedSinceSearch,
        isSearchLoading,
        isLoadingMore: rootSessionRuntime.resultsArrivalState.isLoadingMore,
        hasResults: rootSessionRuntime.resultsArrivalState.hasResults,
        searchLayoutTop: searchLayout.top,
        searchLayoutHeight: searchLayout.height,
        insetsTop: insets.top,
        shouldDimResultsSheet: presentationState.shouldDimResultsSheet,
        shouldSuspendResultsSheet: presentationState.shouldSuspendResultsSheet,
        inputMode: shellModel.inputMode,
        searchSheetContentLaneKind: shellModel.searchSheetContentLane.kind,
        searchHeaderDefaultChromeProgress: shellModel.defaultChromeProgress,
        headerShortcutsVisibleTarget: shellModel.headerVisualModel.shortcutsVisibleTarget,
        headerShortcutsInteractive: shellModel.headerVisualModel.shortcutsInteractive,
        backdropTarget: shellModel.backdropTarget,
      },
      shortcutHarnessArgs: {
        submitShortcutSearchRef,
        setQuery: rootPrimitivesRuntime.searchState.setQuery,
        submitViewportShortcut: submitRuntimeResult.submitViewportShortcut,
      },
    },
  };
};
