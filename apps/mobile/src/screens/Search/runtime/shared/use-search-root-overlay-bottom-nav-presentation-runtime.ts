import React from 'react';

import type { SearchRootOverlayHostVisualRuntime } from './search-root-visual-runtime-contract';

export const useSearchRootOverlayBottomNavPresentationRuntime = ({
  visualRuntime,
}: {
  visualRuntime: SearchRootOverlayHostVisualRuntime;
}) => {
  return React.useMemo(
    () => ({
      bottomNavMotionRuntime: visualRuntime.bottomNavMotionRuntime,
      shouldHideBottomNav: visualRuntime.shouldHideBottomNavForRender,
    }),
    [visualRuntime.bottomNavMotionRuntime, visualRuntime.shouldHideBottomNavForRender]
  );
};
