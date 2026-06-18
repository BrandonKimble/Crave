import React from 'react';

import type { SearchOverlayHostGateSnapshot } from './search-overlay-host-gate-snapshot-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootOverlayHostVisualRuntime } from './search-root-visual-runtime-contract';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
import { createSearchOverlayHostGateSnapshot } from './search-root-overlay-gate-visual-snapshot-runtime';

export const useSearchRootOverlayGateVisualSourceRuntime = ({
  appEntryPlaneRuntime,
  rootOverlayFoundationRuntime,
  visualRuntime,
}: {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  visualRuntime: SearchRootOverlayHostVisualRuntime;
}): SearchOverlayHostGateSnapshot =>
  React.useMemo(
    () =>
      createSearchOverlayHostGateSnapshot({
        isFocused: appEntryPlaneRuntime.isFocused,
        statusBarFadeHeight: visualRuntime.statusBarFadeHeight,
        onProfilerRender:
          rootOverlayFoundationRuntime.rootInstrumentationRuntime.handleProfilerRender,
      }),
    [
      appEntryPlaneRuntime.isFocused,
      rootOverlayFoundationRuntime.rootInstrumentationRuntime.handleProfilerRender,
      visualRuntime.statusBarFadeHeight,
    ]
  );
