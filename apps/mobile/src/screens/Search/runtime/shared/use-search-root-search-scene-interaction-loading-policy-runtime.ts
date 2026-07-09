import { useMemo } from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

// The interaction-loading (skeleton) cover may show ONLY while a real toggle interaction is in
// flight. The presentation machine's coverState maps every non-hidden state to
// 'interaction_loading' (and results_exit transactions force it), so fresh-search presentation
// churn used to blip surfaceMode through interaction_loading right after the cards revealed —
// flashing the cover over freshly revealed results. The toggle-interaction bus state spans
// exactly the intended window (press-up → finalize at reveal settle) and is never set by a
// plain search, so it is the structural gate.
export const useSearchRootSearchSceneInteractionLoadingPolicyRuntime = ({
  searchSheetContentLaneKind,
  searchRuntimeBus,
}: {
  searchSheetContentLaneKind: string;
  searchRuntimeBus: SearchRuntimeBus;
}) => {
  const hasActiveToggleInteraction = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.toggleInteraction.kind != null,
    Object.is,
    ['toggleInteraction'] as const
  );
  return useMemo(
    () =>
      hasActiveToggleInteraction &&
      searchSheetContentLaneKind !== 'results_closing' &&
      searchSheetContentLaneKind !== 'persistent_poll',
    [hasActiveToggleInteraction, searchSheetContentLaneKind]
  );
};
