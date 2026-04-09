import { useAnimatedStyle } from 'react-native-reanimated';

import { SEARCH_BAR_SHADOW } from '../../shadows';
import type {
  SearchForegroundChromeSurfaceVisualRuntime,
  UseSearchForegroundVisualRuntimeArgs,
} from './use-search-foreground-visual-runtime-contract';

const SEARCH_BAR_BASE_SHADOW_OPACITY = Number(SEARCH_BAR_SHADOW.shadowOpacity ?? 0);
const SEARCH_BAR_BASE_ELEVATION = Number(SEARCH_BAR_SHADOW.elevation ?? 0);

const shadowFadeStyle = (baseOpacity: number, baseElevation: number, alpha: number) => {
  'worklet';
  const clampedAlpha = Math.max(0, Math.min(alpha, 1));
  return {
    shadowOpacity: baseOpacity * clampedAlpha,
    elevation: clampedAlpha > 0 ? baseElevation : 0,
  };
};

type UseSearchForegroundChromeSurfaceVisualRuntimeArgs = Pick<
  UseSearchForegroundVisualRuntimeArgs,
  | 'suggestionProgress'
  | 'isSuggestionPanelActive'
  | 'isSuggestionOverlayVisible'
  | 'searchChromeOpacity'
  | 'searchChromeScale'
>;

export const useSearchForegroundChromeSurfaceVisualRuntime = ({
  suggestionProgress,
  isSuggestionPanelActive,
  isSuggestionOverlayVisible,
  searchChromeOpacity,
  searchChromeScale,
}: UseSearchForegroundChromeSurfaceVisualRuntimeArgs): SearchForegroundChromeSurfaceVisualRuntime => {
  const shouldLockSearchChromeTransform = isSuggestionPanelActive || isSuggestionOverlayVisible;
  const searchSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity: suggestionProgress.value,
    transform: [{ scale: 1 }],
    shadowOpacity: 0,
    elevation: 0,
  }));
  const searchBarContainerAnimatedStyle = useAnimatedStyle(() => {
    const backgroundAlpha = 1 - suggestionProgress.value;
    const chromeOpacity = searchChromeOpacity.value;
    const chromeScale = shouldLockSearchChromeTransform ? 1 : searchChromeScale.value;
    return {
      opacity: chromeOpacity,
      backgroundColor: `rgba(255, 255, 255, ${backgroundAlpha})`,
      ...shadowFadeStyle(
        SEARCH_BAR_BASE_SHADOW_OPACITY,
        SEARCH_BAR_BASE_ELEVATION,
        backgroundAlpha
      ),
      borderWidth: 0,
      transform: [{ scale: chromeScale }],
      display: chromeOpacity < 0.02 ? 'none' : 'flex',
    };
  }, [shouldLockSearchChromeTransform]);
  const suggestionPanelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: 0 }],
  }));

  return {
    searchSurfaceAnimatedStyle,
    searchBarContainerAnimatedStyle,
    suggestionPanelAnimatedStyle,
  };
};
