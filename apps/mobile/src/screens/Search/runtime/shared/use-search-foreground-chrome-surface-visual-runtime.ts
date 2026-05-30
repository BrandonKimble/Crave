import { useAnimatedStyle } from 'react-native-reanimated';

import { SEARCH_CHROME_SCALE_TRANSFORM_ORIGIN } from '../../constants/search';
import { SEARCH_BAR_SHADOW } from '../../shadows';
import type {
  SearchForegroundChromeSurfaceVisualRuntime,
  UseSearchForegroundVisualRuntimeArgs,
} from './use-search-foreground-visual-runtime-contract';

type UseSearchForegroundChromeSurfaceVisualRuntimeArgs = Pick<
  UseSearchForegroundVisualRuntimeArgs,
  | 'isSuggestionPanelActive'
  | 'isSuggestionOverlayVisible'
  | 'suggestionProgress'
  | 'searchChromeOpacity'
  | 'searchChromeScale'
>;

export const useSearchForegroundChromeSurfaceVisualRuntime = ({
  isSuggestionPanelActive,
  isSuggestionOverlayVisible,
  suggestionProgress,
  searchChromeOpacity,
  searchChromeScale,
}: UseSearchForegroundChromeSurfaceVisualRuntimeArgs): SearchForegroundChromeSurfaceVisualRuntime => {
  const searchSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity: suggestionProgress.value,
    transform: [{ scale: 1 }],
    shadowOpacity: 0,
    elevation: 0,
  }));
  const searchBarContainerAnimatedStyle = useAnimatedStyle(() => {
    const chromeAlpha = 1 - suggestionProgress.value;
    const chromeScale =
      isSuggestionPanelActive || isSuggestionOverlayVisible ? 1 : searchChromeScale.value;
    return {
      opacity: searchChromeOpacity.value,
      backgroundColor: `rgba(255, 255, 255, ${chromeAlpha})`,
      shadowOpacity: Number(SEARCH_BAR_SHADOW.shadowOpacity ?? 0) * chromeAlpha,
      elevation: chromeAlpha > 0 ? Number(SEARCH_BAR_SHADOW.elevation ?? 0) : 0,
      transformOrigin: SEARCH_CHROME_SCALE_TRANSFORM_ORIGIN,
      transform: [{ scale: chromeScale }],
    };
  }, [
    isSuggestionOverlayVisible,
    isSuggestionPanelActive,
    searchChromeOpacity,
    searchChromeScale,
    suggestionProgress,
  ]);
  const suggestionPanelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: 0 }],
  }));

  return {
    searchSurfaceAnimatedStyle,
    searchBarContainerAnimatedStyle,
    suggestionPanelAnimatedStyle,
  };
};
