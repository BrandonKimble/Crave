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
      preserveSheetState,
      transitionFromDockedPolls,
    }: Parameters<
      NonNullable<typeof instrumentationRuntime.submitShortcutSearchRef.current>
    >[0]) => {
      searchState.setQuery(label);
      await viewportShortcutControlLane.submitViewportShortcut(targetTab, label, {
        preserveSheetState,
        transitionFromDockedPolls,
      });
    },
    [instrumentationRuntime.submitShortcutSearchRef, searchState, viewportShortcutControlLane]
  );

  instrumentationRuntime.submitShortcutSearchRef.current = submitShortcutSearch;
};
