import {
  type SearchForegroundVisualRuntime,
  type UseSearchForegroundVisualRuntimeArgs,
} from './use-search-foreground-visual-runtime-contract';
import { useSearchForegroundBottomNavVisualRuntime } from './use-search-foreground-bottom-nav-visual-runtime';
import { useSearchForegroundChromeSurfaceVisualRuntime } from './use-search-foreground-chrome-surface-visual-runtime';
import { useSearchForegroundSearchThisAreaVisualRuntime } from './use-search-foreground-search-this-area-visual-runtime';
import { useSearchForegroundShortcutsVisualRuntime } from './use-search-foreground-shortcuts-visual-runtime';

export type { SearchForegroundVisualRuntime } from './use-search-foreground-visual-runtime-contract';

export const useSearchForegroundVisualRuntime = ({
  shouldDimResultsSheet,
  isSuggestionOverlayVisible,
  suggestionProgress,
  shouldSuspendResultsSheet,
  isSearchOverlay,
  inputMode,
  searchSheetContentLaneKind,
  navBarTopForSnaps,
  fallbackNavBarHeight,
  bottomNavHiddenTranslateY,
  searchHeaderDefaultChromeProgress,
  shouldDisableSearchShortcuts,
  shouldRenderSearchOverlay,
  headerShortcutsVisibleTarget,
  headerShortcutsInteractive,
  backdropTarget,
  isSuggestionPanelActive,
  searchChromeTransitionProgress,
  searchChromeOpacity,
  searchChromeScale,
  isSearchSessionActive,
  mapMovedSinceSearch,
  isSearchLoading,
  isLoadingMore,
  hasResults,
  searchLayoutTop,
  searchLayoutHeight,
  insetsTop,
}: UseSearchForegroundVisualRuntimeArgs): SearchForegroundVisualRuntime => {
  const bottomNavVisualRuntime = useSearchForegroundBottomNavVisualRuntime({
    shouldDimResultsSheet,
    isSuggestionOverlayVisible,
    suggestionProgress,
    shouldSuspendResultsSheet,
    isSearchOverlay,
    inputMode,
    searchSheetContentLaneKind,
    navBarTopForSnaps,
    fallbackNavBarHeight,
    bottomNavHiddenTranslateY,
    searchHeaderDefaultChromeProgress,
    isSuggestionPanelActive,
    backdropTarget,
  });
  const shortcutsVisualRuntime = useSearchForegroundShortcutsVisualRuntime({
    shouldDisableSearchShortcuts,
    shouldRenderSearchOverlay,
    headerShortcutsVisibleTarget,
    headerShortcutsInteractive,
    isSearchOverlay,
    isSuggestionPanelActive,
    isSuggestionOverlayVisible,
    backdropTarget,
    suggestionProgress,
    searchHeaderDefaultChromeProgress,
    searchChromeTransitionProgress,
    searchChromeOpacity,
    searchChromeScale,
  });
  const chromeSurfaceVisualRuntime = useSearchForegroundChromeSurfaceVisualRuntime({
    suggestionProgress,
    isSuggestionPanelActive,
    isSuggestionOverlayVisible,
    searchChromeOpacity,
    searchChromeScale,
  });
  const searchThisAreaVisualRuntime = useSearchForegroundSearchThisAreaVisualRuntime({
    isSearchOverlay,
    isSuggestionPanelActive,
    backdropTarget,
    isSearchSessionActive,
    mapMovedSinceSearch,
    isSearchLoading,
    isLoadingMore,
    hasResults,
    searchChromeOpacity,
    searchChromeScale,
    searchLayoutTop,
    searchLayoutHeight,
    insetsTop,
    isSuggestionOverlayVisible,
  });

  return {
    ...bottomNavVisualRuntime,
    ...shortcutsVisualRuntime,
    ...chromeSurfaceVisualRuntime,
    ...searchThisAreaVisualRuntime,
  };
};
