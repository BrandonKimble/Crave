import React from 'react';

import type { SearchForegroundHeaderShortcutsInputs } from './search-foreground-chrome-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootOverlayHostVisualRuntime } from './search-root-visual-runtime-contract';
import type { SearchRootForegroundInteractionControlLane } from './use-search-root-control-plane-runtime-contract';
import { useSearchRootOverlayShortcutsInteractionRuntime } from './use-search-root-overlay-shortcuts-interaction-runtime';
import { useSearchRootOverlayShortcutsLayoutRuntime } from './use-search-root-overlay-shortcuts-layout-runtime';
import { useSearchRootOverlayShortcutsPresentationRuntime } from './use-search-root-overlay-shortcuts-presentation-runtime';

type UseSearchRootOverlayShortcutsVisualRuntimeArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
  visualRuntime: SearchRootOverlayHostVisualRuntime;
};

export const useSearchRootOverlayShortcutsVisualRuntime = ({
  stateFoundationLane,
  foregroundInteractionControlLane,
  visualRuntime,
}: UseSearchRootOverlayShortcutsVisualRuntimeArgs): SearchForegroundHeaderShortcutsInputs => {
  const shortcutsVisual = useSearchRootOverlayShortcutsPresentationRuntime({
    visualRuntime,
  });
  const shortcutsInteraction = useSearchRootOverlayShortcutsInteractionRuntime({
    foregroundInteractionControlLane,
  });
  const shortcutsLayout = useSearchRootOverlayShortcutsLayoutRuntime({
    stateFoundationLane,
  });

  return React.useMemo(
    () => ({
      ...shortcutsVisual,
      ...shortcutsInteraction,
      ...shortcutsLayout,
    }),
    [shortcutsInteraction, shortcutsLayout, shortcutsVisual]
  );
};
