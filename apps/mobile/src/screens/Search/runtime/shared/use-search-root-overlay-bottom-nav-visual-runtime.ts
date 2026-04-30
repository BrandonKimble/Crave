import React from 'react';

import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootOverlayHostVisualRuntime } from './search-root-visual-runtime-contract';
import type { SearchBottomNavVisualInputs } from './search-bottom-nav-visual-input-contract';
import { useSearchRootOverlayBottomNavLayoutRuntime } from './use-search-root-overlay-bottom-nav-layout-runtime';
import { useSearchRootOverlayBottomNavPresentationRuntime } from './use-search-root-overlay-bottom-nav-presentation-runtime';

type UseSearchRootOverlayBottomNavVisualRuntimeArgs = {
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  visualRuntime: SearchRootOverlayHostVisualRuntime;
};

export const useSearchRootOverlayBottomNavVisualRuntime = ({
  rootOverlayFoundationRuntime,
  visualRuntime,
}: UseSearchRootOverlayBottomNavVisualRuntimeArgs): SearchBottomNavVisualInputs => {
  const bottomNavLayout = useSearchRootOverlayBottomNavLayoutRuntime({
    rootOverlayFoundationRuntime,
  });
  const bottomNavVisual = useSearchRootOverlayBottomNavPresentationRuntime({
    visualRuntime,
  });

  return React.useMemo(
    () => ({
      ...bottomNavLayout,
      ...bottomNavVisual,
    }),
    [bottomNavLayout, bottomNavVisual]
  );
};
