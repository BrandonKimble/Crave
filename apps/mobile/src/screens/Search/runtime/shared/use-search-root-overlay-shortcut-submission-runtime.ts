import React from 'react';

import type { SearchRootInstrumentationRuntime } from './search-root-scaffold-runtime-contract';
import type { SearchRootViewportShortcutControlLane } from './search-root-control-plane-runtime-contract';

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

  // F1326: this was a bare render-body assignment with no teardown — see the note in
  // use-search-root-results-presentation-authority-runtime. Assign in an effect, restore the
  // inert default on unmount, so a perf deep link can never drive a torn-down tree.
  React.useEffect(() => {
    const commandRef = instrumentationRuntime.submitShortcutScenarioCommandRef;
    commandRef.current = submitShortcutSearch;
    return () => {
      commandRef.current = async () => undefined;
    };
  }, [instrumentationRuntime.submitShortcutScenarioCommandRef, submitShortcutSearch]);
};
