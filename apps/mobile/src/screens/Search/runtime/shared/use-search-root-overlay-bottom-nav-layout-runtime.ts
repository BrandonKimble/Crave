import React from 'react';

import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';

export const useSearchRootOverlayBottomNavLayoutRuntime = ({
  rootOverlayFoundationRuntime,
}: {
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
}) =>
  React.useMemo(
    () => ({
      bottomInset: rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime.bottomInset,
      handleBottomNavLayout:
        rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime.handleBottomNavLayout,
    }),
    [
      rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime.bottomInset,
      rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime.handleBottomNavLayout,
    ]
  );
