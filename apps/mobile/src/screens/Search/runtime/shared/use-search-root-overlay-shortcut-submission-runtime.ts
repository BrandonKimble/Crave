import React from 'react';

import type { SearchRootInstrumentationRuntime } from './search-root-scaffold-runtime-contract';
import type { SearchRootViewportShortcutControlLane } from './use-search-root-control-plane-runtime-contract';

type SearchRootShortcutVisualSearchState = {
  setQuery: React.Dispatch<React.SetStateAction<string>>;
};

type UseSearchRootOverlayShortcutSubmissionRuntimeArgs = {
  instrumentationRuntime: SearchRootInstrumentationRuntime;
  viewportShortcutControlLane: SearchRootViewportShortcutControlLane;
  searchState: SearchRootShortcutVisualSearchState;
};

export const useSearchRootOverlayShortcutSubmissionRuntime = ({
  instrumentationRuntime,
  viewportShortcutControlLane,
  searchState,
}: UseSearchRootOverlayShortcutSubmissionRuntimeArgs): void => {
  const submitShortcutSearch = React.useCallback(
    async ({
      targetTab,
      label,
      forceFreshBounds,
    }: Parameters<
      NonNullable<typeof instrumentationRuntime.submitShortcutScenarioCommandRef.current>
    >[0]) => {
      searchState.setQuery(label);
      await viewportShortcutControlLane.submitViewportShortcut(targetTab, label, {
        forceFreshBounds: forceFreshBounds ?? true,
      });
    },
    [
      instrumentationRuntime.submitShortcutScenarioCommandRef,
      searchState,
      viewportShortcutControlLane,
    ]
  );

  instrumentationRuntime.submitShortcutScenarioCommandRef.current = submitShortcutSearch;
};
