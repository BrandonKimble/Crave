import { useAnimatedStyle } from 'react-native-reanimated';

import type {
  SearchForegroundChromeSurfaceVisualRuntime,
  UseSearchForegroundVisualRuntimeArgs,
} from './use-search-foreground-visual-runtime-contract';

type UseSearchForegroundChromeSurfaceVisualRuntimeArgs = Pick<
  UseSearchForegroundVisualRuntimeArgs,
  'suggestionProgress' | 'searchChromeScale'
>;

export const useSearchForegroundChromeSurfaceVisualRuntime = ({
  suggestionProgress,
  searchChromeScale,
}: UseSearchForegroundChromeSurfaceVisualRuntimeArgs): SearchForegroundChromeSurfaceVisualRuntime => {
  const searchSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity: suggestionProgress.value,
    transform: [{ scale: 1 }],
    shadowOpacity: 0,
    elevation: 0,
  }));
  const searchBarContainerAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: 1,
      transform: [{ scale: searchChromeScale.value }],
    };
  });
  const suggestionPanelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: 0 }],
  }));

  return {
    searchSurfaceAnimatedStyle,
    searchBarContainerAnimatedStyle,
    suggestionPanelAnimatedStyle,
  };
};
