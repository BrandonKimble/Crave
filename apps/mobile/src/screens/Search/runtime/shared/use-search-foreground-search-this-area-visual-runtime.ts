import { useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated';

import type {
  SearchForegroundSearchThisAreaVisualRuntime,
  UseSearchForegroundVisualRuntimeArgs,
} from './use-search-foreground-visual-runtime-contract';

type UseSearchForegroundSearchThisAreaVisualRuntimeArgs = Pick<
  UseSearchForegroundVisualRuntimeArgs,
  | 'isSearchOverlay'
  | 'isSuggestionPanelActive'
  | 'backdropTarget'
  | 'isSearchSessionActive'
  | 'mapMovedSinceSearch'
  | 'isSearchLoading'
  | 'isLoadingMore'
  | 'hasResults'
  | 'searchChromeOpacity'
  | 'searchChromeScale'
  | 'searchLayoutTop'
  | 'searchLayoutHeight'
  | 'insetsTop'
  | 'isSuggestionOverlayVisible'
>;

export const useSearchForegroundSearchThisAreaVisualRuntime = ({
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
}: UseSearchForegroundSearchThisAreaVisualRuntimeArgs): SearchForegroundSearchThisAreaVisualRuntime => {
  const shouldLockSearchChromeTransform = isSuggestionPanelActive || isSuggestionOverlayVisible;
  const shouldShowSearchThisArea =
    isSearchOverlay &&
    !isSuggestionPanelActive &&
    backdropTarget === 'results' &&
    isSearchSessionActive &&
    mapMovedSinceSearch &&
    !isSearchLoading &&
    !isLoadingMore &&
    hasResults;
  const searchThisAreaRevealProgress = useDerivedValue(() => {
    return withTiming(shouldShowSearchThisArea ? 1 : 0, { duration: 200 });
  }, [shouldShowSearchThisArea]);
  const searchThisAreaAnimatedStyle = useAnimatedStyle(() => {
    const opacity = searchChromeOpacity.value * searchThisAreaRevealProgress.value;
    const chromeScale = shouldLockSearchChromeTransform ? 1 : searchChromeScale.value;
    return {
      opacity,
      transform: [{ scale: chromeScale }],
      display: opacity < 0.02 ? 'none' : 'flex',
    };
  }, [shouldLockSearchChromeTransform]);
  const searchThisAreaTop = Math.max(searchLayoutTop + searchLayoutHeight + 12, insetsTop + 12);
  const statusBarFadeHeightFallback = Math.max(0, insetsTop + 16);
  const statusBarFadeHeight = Math.max(
    0,
    searchLayoutTop > 0 ? searchLayoutTop + 8 : statusBarFadeHeightFallback
  );

  return {
    shouldShowSearchThisArea,
    searchThisAreaTop,
    searchThisAreaAnimatedStyle,
    statusBarFadeHeight,
  };
};
