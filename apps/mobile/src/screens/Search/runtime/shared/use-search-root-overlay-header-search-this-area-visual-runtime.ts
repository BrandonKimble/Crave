import React from 'react';

import type { SearchForegroundHeaderSearchThisAreaVisualInputs } from './search-foreground-chrome-contract';
import type { SearchRootOverlayHeaderSearchThisAreaVisualRuntime } from './search-root-visual-runtime-contract';

export const useSearchRootOverlayHeaderSearchThisAreaVisualRuntime = ({
  visualRuntime,
}: {
  visualRuntime: SearchRootOverlayHeaderSearchThisAreaVisualRuntime;
}): SearchForegroundHeaderSearchThisAreaVisualInputs =>
  React.useMemo(
    () => ({
      shouldShowSearchThisArea: visualRuntime.shouldShowSearchThisArea,
      searchThisAreaTop: visualRuntime.searchThisAreaTop,
      searchThisAreaAnimatedStyle: visualRuntime.searchThisAreaAnimatedStyle,
    }),
    [
      visualRuntime.searchThisAreaAnimatedStyle,
      visualRuntime.searchThisAreaTop,
      visualRuntime.shouldShowSearchThisArea,
    ]
  );
