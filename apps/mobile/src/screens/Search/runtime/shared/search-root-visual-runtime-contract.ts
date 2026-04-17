import type { SharedValue } from 'react-native-reanimated';

import type { SearchForegroundVisualRuntime } from './use-search-foreground-visual-runtime';
import { useSearchChromeTransitionRuntime } from './use-search-chrome-transition-runtime';
import { useSearchCloseVisualHandoffRuntime } from './use-search-close-visual-handoff-runtime';

export type SearchRootVisualRuntime = SearchForegroundVisualRuntime & {
  overlayHeaderActionProgress: SharedValue<number>;
  overlayChromeTransitionProgress: SharedValue<number>;
  overlayBackdropDimProgress: SharedValue<number>;
  closeVisualHandoffProgress: ReturnType<
    typeof useSearchCloseVisualHandoffRuntime
  >['closeVisualHandoffProgress'];
  searchBarInputAnimatedStyle: ReturnType<
    typeof useSearchChromeTransitionRuntime
  >['searchBarInputAnimatedStyle'];
};
