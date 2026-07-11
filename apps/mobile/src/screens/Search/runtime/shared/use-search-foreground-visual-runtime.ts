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
  isSearchOverlay,
  inputMode,
  searchSheetContentLaneKind,
  navBarTopForSnaps,
  fallbackNavBarHeight,
  bottomNavHiddenTranslateY,
  shouldDisableSearchShortcuts,
  shouldRenderSearchOverlay,
  headerShortcutsVisibleTarget,
  headerShortcutsInteractive,
  backdropTarget,
  isSuggestionPanelActive,
  searchChromeTransitionProgress: _searchChromeTransitionProgress,
  searchChromeOpacity,
  searchChromeContentOpacity,
  searchChromeScale,
  searchChromeTranslateY,
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
    suggestionProgress,
    isSearchOverlay,
    inputMode,
    searchSheetContentLaneKind,
    navBarTopForSnaps,
    fallbackNavBarHeight,
    bottomNavHiddenTranslateY,
    isSuggestionPanelActive,
    backdropTarget,
  });
  const shortcutsVisualRuntime = useSearchForegroundShortcutsVisualRuntime({
    isSuggestionPanelActive,
    isSuggestionOverlayVisible,
    backdropTarget,
    suggestionProgress,
    searchChromeContentOpacity,
    searchChromeScale,
    searchChromeTranslateY,
    shouldDisableSearchShortcuts,
    shouldRenderSearchOverlay,
    headerShortcutsVisibleTarget,
    headerShortcutsInteractive,
    isSearchOverlay,
  });
  const chromeSurfaceVisualRuntime = useSearchForegroundChromeSurfaceVisualRuntime({
    isSuggestionPanelActive,
    isSuggestionOverlayVisible,
    suggestionProgress,
    searchChromeOpacity,
    searchChromeScale,
    searchChromeTranslateY,
  });
  const searchThisAreaVisualRuntime = useSearchForegroundSearchThisAreaVisualRuntime({
    isSuggestionPanelActive,
    searchChromeOpacity,
    searchChromeScale,
    searchLayoutTop,
    searchLayoutHeight,
    insetsTop,
    isSuggestionOverlayVisible,
    isSearchOverlay,
    backdropTarget,
    isSearchSessionActive,
    mapMovedSinceSearch,
    isSearchLoading,
    isLoadingMore,
    hasResults,
  });
  return {
    ...bottomNavVisualRuntime,
    ...shortcutsVisualRuntime,
    ...chromeSurfaceVisualRuntime,
    ...searchThisAreaVisualRuntime,
  };
};
