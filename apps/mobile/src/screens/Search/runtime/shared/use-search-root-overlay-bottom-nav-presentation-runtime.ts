import React from 'react';

import type { SearchRootOverlayHostVisualRuntime } from './search-root-visual-runtime-contract';

export const useSearchRootOverlayBottomNavPresentationRuntime = ({
  visualRuntime,
}: {
  visualRuntime: SearchRootOverlayHostVisualRuntime;
}) =>
  React.useMemo(
    () => ({
      bottomNavAnimatedStyle: visualRuntime.bottomNavAnimatedStyle,
      shouldHideBottomNav: visualRuntime.shouldHideBottomNavForRender,
      bottomNavItemVisibilityAnimatedStyle:
        visualRuntime.bottomNavItemVisibilityAnimatedStyle,
    }),
    [
      visualRuntime.bottomNavAnimatedStyle,
      visualRuntime.bottomNavItemVisibilityAnimatedStyle,
      visualRuntime.shouldHideBottomNavForRender,
    ]
  );
