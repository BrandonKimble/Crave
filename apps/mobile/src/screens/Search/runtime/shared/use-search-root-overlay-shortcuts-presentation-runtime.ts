import React from 'react';

import type { SearchRootOverlayHostVisualRuntime } from './search-root-visual-runtime-contract';

export const useSearchRootOverlayShortcutsPresentationRuntime = ({
  visualRuntime,
}: {
  visualRuntime: SearchRootOverlayHostVisualRuntime;
}) =>
  React.useMemo(
    () => ({
      shouldMountSearchShortcuts: visualRuntime.shouldMountSearchShortcuts,
      shouldEnableSearchShortcutsInteraction:
        visualRuntime.shouldEnableSearchShortcutsInteraction,
      searchShortcutsAnimatedStyle:
        visualRuntime.searchShortcutsAnimatedStyle,
      searchShortcutChipAnimatedStyle:
        visualRuntime.searchShortcutChipAnimatedStyle,
    }),
    [
      visualRuntime.searchShortcutChipAnimatedStyle,
      visualRuntime.searchShortcutsAnimatedStyle,
      visualRuntime.shouldEnableSearchShortcutsInteraction,
      visualRuntime.shouldMountSearchShortcuts,
    ]
  );
