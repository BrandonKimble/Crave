import React from 'react';

import type {
  SearchOverlayChromeFrameSnapshot,
  SearchOverlayChromeHostSnapshot,
  SearchForegroundHeaderSearchThisAreaInputs,
  SearchOverlayChromeContainerSnapshot,
  SearchOverlayChromeHeaderProps,
  SearchOverlayChromeSuggestionSurfaceProps,
} from './search-foreground-chrome-contract';
import type {
  SearchRootOverlayChromeHostRuntime,
  SearchRootOverlayHostRuntimeParams,
} from './search-root-overlay-host-runtime-contract';
import { useSearchRootOverlayHeaderSearchBarInteractionRuntime } from './use-search-root-overlay-header-search-bar-interaction-runtime';
import { useSearchRootOverlayHeaderSearchBarLayoutRuntime } from './use-search-root-overlay-header-search-bar-layout-runtime';
import { useSearchRootOverlayHeaderSearchBarVisualRuntime } from './use-search-root-overlay-header-search-bar-visual-runtime';
import { useSearchRootOverlayHeaderSearchThisAreaInteractionRuntime } from './use-search-root-overlay-header-search-this-area-interaction-runtime';
import { useSearchRootOverlayHeaderSearchThisAreaVisualRuntime } from './use-search-root-overlay-header-search-this-area-visual-runtime';
import { useSearchRootOverlayHeaderWarmupSourceRuntime } from './use-search-root-overlay-header-warmup-source-runtime';
import { useSearchRootOverlayShortcutsVisualRuntime } from './use-search-root-overlay-shortcuts-visual-runtime';
import { useSearchRootOverlaySuggestionDataInputsRuntime } from './use-search-root-overlay-suggestion-data-inputs-runtime';
import { useSearchRootOverlaySuggestionPanelInputsRuntime } from './use-search-root-overlay-suggestion-panel-inputs-runtime';
import { useSearchRootOverlaySuggestionScrollInputsRuntime } from './use-search-root-overlay-suggestion-scroll-inputs-runtime';
import { useSearchRootOverlaySuggestionSelectionInputsRuntime } from './use-search-root-overlay-suggestion-selection-inputs-runtime';
import { useSearchRootOverlaySuggestionShellContainerRuntime } from './use-search-root-overlay-suggestion-shell-container-runtime';
import { useSearchRootOverlaySuggestionShellLayoutRuntime } from './use-search-root-overlay-suggestion-shell-layout-runtime';
import { useSearchRootOverlaySuggestionShellMotionRuntime } from './use-search-root-overlay-suggestion-shell-motion-runtime';
import { useSearchChromeTouchSurfaceGeometryRuntime } from './use-search-chrome-touch-surface-geometry-runtime';
import { searchChromeNativeHitTargetRegistry } from '../native/search-chrome-native-hit-target';

export const useSearchRootOverlayChromeHostRuntime = ({
  appEntryPlaneRuntime,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  overlayHostVisualRuntime,
  overlaySceneHostVisualRuntime,
  foregroundInteractionControlLane,
  foregroundInputControlLane,
  profileControlRuntime,
  controlAuthorityRuntime,
}: Pick<
  SearchRootOverlayHostRuntimeParams,
  | 'appEntryPlaneRuntime'
  | 'stateFoundationLane'
  | 'rootOverlayFoundationRuntime'
  | 'overlayHostVisualRuntime'
  | 'overlaySceneHostVisualRuntime'
  | 'foregroundInteractionControlLane'
  | 'foregroundInputControlLane'
  | 'profileControlRuntime'
  | 'controlAuthorityRuntime'
>): SearchRootOverlayChromeHostRuntime => {
  const shouldRenderSearchOverlay =
    rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime.shouldRenderSearchOverlay;
  const shortcutsInputs = useSearchRootOverlayShortcutsVisualRuntime({
    stateFoundationLane,
    foregroundInteractionControlLane,
    visualRuntime: overlayHostVisualRuntime,
  });
  const searchBarLayoutInputs = useSearchRootOverlayHeaderSearchBarLayoutRuntime({
    stateFoundationLane,
  });
  const searchBarVisualInputs = useSearchRootOverlayHeaderSearchBarVisualRuntime({
    stateFoundationLane,
    suggestionInteractionControlLane: profileControlRuntime.suggestionInteractionControlLane,
    resultsPresentationControlLane:
      controlAuthorityRuntime.presentationAuthorityRuntime.resultsPresentationControlLane,
    visualRuntime: overlaySceneHostVisualRuntime,
  });
  const searchBarInteractionInputs = useSearchRootOverlayHeaderSearchBarInteractionRuntime({
    foregroundInteractionControlLane,
    foregroundInputControlLane,
    suggestionInteractionControlLane: profileControlRuntime.suggestionInteractionControlLane,
  });
  const searchThisAreaVisualInputs = useSearchRootOverlayHeaderSearchThisAreaVisualRuntime({
    visualRuntime: overlaySceneHostVisualRuntime,
  });
  const searchThisAreaInteractionInputs =
    useSearchRootOverlayHeaderSearchThisAreaInteractionRuntime({
      foregroundInteractionControlLane,
    });
  const searchChromeTouchSurfaceRuntime = useSearchChromeTouchSurfaceGeometryRuntime({
    stateFoundationLane,
    shortcutsInputs,
    searchThisAreaInputs: {
      ...searchThisAreaVisualInputs,
      ...searchThisAreaInteractionInputs,
    },
  });
  React.useEffect(() => {
    searchChromeNativeHitTargetRegistry.syncRuntime(searchChromeTouchSurfaceRuntime);
  }, [searchChromeTouchSurfaceRuntime]);
  const shortcutsInteractionEnabledRef = React.useRef(false);
  shortcutsInteractionEnabledRef.current =
    shortcutsInputs.shouldMountSearchShortcuts &&
    shortcutsInputs.shouldEnableSearchShortcutsInteraction;
  const { hiddenSearchFiltersWarmupProps } = useSearchRootOverlayHeaderWarmupSourceRuntime({
    searchState: stateFoundationLane.rootPrimitivesRuntime.searchState,
  });
  const suggestionShellContainerRuntime = useSearchRootOverlaySuggestionShellContainerRuntime({
    appEntryPlaneRuntime,
    stateFoundationLane,
    visualRuntime: overlaySceneHostVisualRuntime,
  });
  const suggestionShellLayoutRuntime = useSearchRootOverlaySuggestionShellLayoutRuntime({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    visualRuntime: overlaySceneHostVisualRuntime,
  });
  const suggestionShellMotionRuntime = useSearchRootOverlaySuggestionShellMotionRuntime({
    stateFoundationLane,
    visualRuntime: overlaySceneHostVisualRuntime,
  });
  const suggestionPanelInputs = useSearchRootOverlaySuggestionPanelInputsRuntime({
    stateFoundationLane,
  });
  const suggestionDataInputs = useSearchRootOverlaySuggestionDataInputsRuntime({
    stateFoundationLane,
  });
  const suggestionScrollInputs = useSearchRootOverlaySuggestionScrollInputsRuntime({
    stateFoundationLane,
    suggestionInteractionControlLane: profileControlRuntime.suggestionInteractionControlLane,
  });
  const suggestionSelectionInputs = useSearchRootOverlaySuggestionSelectionInputsRuntime({
    foregroundInteractionControlLane,
  });
  const chromeContainerSnapshot = React.useMemo<SearchOverlayChromeContainerSnapshot>(
    () => ({
      overlayContainerStyle: suggestionShellContainerRuntime.overlayContainerStyle,
      isSuggestionOverlayVisible: suggestionShellContainerRuntime.isSuggestionOverlayVisible,
      shouldHideBottomNavForRender: suggestionShellContainerRuntime.shouldHideBottomNavForRender,
    }),
    // F1337: `shouldRenderSearchOverlay` used to ride this dep array without being an input —
    // the memo reads only the three suggestionShellContainerRuntime fields above. Every
    // overlay-visibility flip therefore minted a fresh container snapshot with identical
    // members, cascading the chrome host for nothing. A dep that is not an input is not a
    // safety margin; it is a guaranteed false invalidation.
    [suggestionShellContainerRuntime]
  );
  const chromeHeaderProps = React.useMemo<SearchOverlayChromeHeaderProps>(() => {
    const chromeShortcutInputs = {
      searchShortcutsAnimatedStyle: shortcutsInputs.searchShortcutsAnimatedStyle,
      searchShortcutChipAnimatedStyle: shortcutsInputs.searchShortcutChipAnimatedStyle,
      searchShortcutContentAnimatedStyle: shortcutsInputs.searchShortcutContentAnimatedStyle,
      shortcutsInteractionEnabledRef,
      handleBestRestaurantsHere: shortcutsInputs.handleBestRestaurantsHere,
      handleSearchShortcutsRowLayout: shortcutsInputs.handleSearchShortcutsRowLayout,
      handleShortcutChipLayout: shortcutsInputs.handleShortcutChipLayout,
      handleSearchShortcutsScroll: shortcutsInputs.handleSearchShortcutsScroll,
    };
    const searchThisAreaInputs = {
      ...searchThisAreaVisualInputs,
      ...searchThisAreaInteractionInputs,
      handleSearchThisAreaButtonLayout:
        searchChromeTouchSurfaceRuntime.handleSearchThisAreaButtonLayout,
    } satisfies SearchForegroundHeaderSearchThisAreaInputs;

    return {
      ...searchBarLayoutInputs,
      ...searchBarVisualInputs,
      ...searchBarInteractionInputs,
      ...chromeShortcutInputs,
      ...searchThisAreaInputs,
    };
  }, [
    searchBarInteractionInputs,
    searchBarLayoutInputs,
    searchBarVisualInputs,
    searchThisAreaInteractionInputs,
    searchThisAreaVisualInputs,
    searchChromeTouchSurfaceRuntime.handleSearchThisAreaButtonLayout,
    shortcutsInputs,
  ]);
  const chromeSuggestionSurfaceProps = React.useMemo<SearchOverlayChromeSuggestionSurfaceProps>(
    () => ({
      ...suggestionShellLayoutRuntime,
      ...suggestionShellMotionRuntime,
      ...suggestionPanelInputs,
      ...suggestionDataInputs,
      ...suggestionScrollInputs,
      ...suggestionSelectionInputs,
      pointerEvents:
        shouldRenderSearchOverlay && suggestionShellContainerRuntime.isSuggestionOverlayVisible
          ? ('auto' as const)
          : ('none' as const),
      shouldHideBottomNav: suggestionShellContainerRuntime.shouldHideBottomNavForRender,
    }),
    [
      shouldRenderSearchOverlay,
      suggestionDataInputs,
      suggestionPanelInputs,
      suggestionScrollInputs,
      suggestionSelectionInputs,
      suggestionShellContainerRuntime,
      suggestionShellLayoutRuntime,
      suggestionShellMotionRuntime,
    ]
  );
  const runOneFreezeGate = stateFoundationLane.rootDataPlaneRuntime.freezeGate;
  // F1735: the two redraw freeze flags this folded in were pinned false by construction
  // (fossil coordinator); the response-frame freeze is the live input.
  const isRunOneFreezeActive = runOneFreezeGate.isResponseFrameFreezeActive;
  const chromeFrameSnapshot = React.useMemo<SearchOverlayChromeFrameSnapshot>(
    () => ({
      isFocused: appEntryPlaneRuntime.isFocused,
      shouldRenderSearchOverlay,
      // F1324: this was two byte-identical three-disjunct expressions under two names in
      // this one memo, so a change to the freeze RULE had to be made twice. F6204 finished
      // the job: the two fields the consumers read under different names are ONE field, and
      // the two hand-copied latch machines behind them are one `useFrozenWhile` — a half-edit
      // now deletes the shared hook's only implementation and both hosts fail to compile.
      isRunOneFreezeActive,
      onProfilerRender:
        rootOverlayFoundationRuntime.rootInstrumentationRuntime.handleProfilerRender,
      hiddenSearchFiltersWarmupProps,
    }),
    [
      appEntryPlaneRuntime.isFocused,
      shouldRenderSearchOverlay,
      isRunOneFreezeActive,
      rootOverlayFoundationRuntime.rootInstrumentationRuntime.handleProfilerRender,
      hiddenSearchFiltersWarmupProps,
    ]
  );
  const chromeHostSnapshot = React.useMemo<SearchOverlayChromeHostSnapshot>(
    () => ({
      frameSnapshot: chromeFrameSnapshot,
      containerSnapshot: chromeContainerSnapshot,
      headerProps: chromeHeaderProps,
      suggestionSurfaceProps: chromeSuggestionSurfaceProps,
    }),
    [chromeContainerSnapshot, chromeFrameSnapshot, chromeHeaderProps, chromeSuggestionSurfaceProps]
  );

  return {
    overlayChromeHostSnapshot: chromeHostSnapshot,
    searchChromeTouchSurfaceRuntime,
  };
};
