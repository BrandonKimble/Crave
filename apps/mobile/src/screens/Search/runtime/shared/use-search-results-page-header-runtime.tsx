import React from 'react';
import type { LayoutChangeEvent } from 'react-native';

import {
  publishSearchResultsHeaderLiveState,
  type SearchResultsHeaderLiveState,
} from '../../../../overlays/search-results-header-live-state';
import { useSearchSurfaceRuntimeSelector } from '../surface/search-surface-runtime';

// P5 (page-switch-master-plan.md §6-P5 / owner req 2e): the results header no longer renders
// in-frame — it rides the ONE hoisted PersistentSheetHeaderHost via the 'search' descriptor
// (search-results-header-live-state.tsx). This runtime is the header-model PUBLISHER: it
// resolves the model exactly as before (submitted-query title with the retained fallback,
// close handler, action-morph progress) and publishes it to the module-scope live-state store
// the descriptor components subscribe to.

type UseSearchResultsPageHeaderRuntimeArgs = {
  headerTitle: string;
  activeTabColor: string;
  handleCloseResults: () => void;
};

export const useSearchResultsPageHeaderRuntime = ({
  headerTitle,
  activeTabColor,
  handleCloseResults,
}: UseSearchResultsPageHeaderRuntimeArgs): void => {
  // Retained-page signal kept from the pre-P5 header: while the results page is live OR held
  // (dismiss freeze), the title must not blank — the retained fallback below covers the gap.
  const shouldRetainResultsPage = useSearchSurfaceRuntimeSelector(
    React.useCallback(
      (surfaceSnapshot) =>
        surfaceSnapshot.activeBundle.kind === 'results' || surfaceSnapshot.heldBundle != null,
      []
    )
  );
  const retainedTitleRef = React.useRef<string | null>(null);
  const liveState = React.useMemo<SearchResultsHeaderLiveState>(() => {
    const resolvedHeaderTitle =
      headerTitle.trim().length > 0 ? headerTitle : (retainedTitleRef.current ?? 'Results');
    return {
      headerTitle: resolvedHeaderTitle,
      activeTabColor,
      handleCloseResults,
    };
  }, [
    activeTabColor,
    handleCloseResults,
    headerTitle,
    shouldRetainResultsPage,
  ]);
  retainedTitleRef.current = liveState.headerTitle;

  // Layout effect (not useEffect): the descriptor must read the fresh model on the FIRST painted
  // frame of a reveal — the title/close swap is the "which page am I on" signal (owner req 2b).
  React.useLayoutEffect(() => {
    publishSearchResultsHeaderLiveState(liveState);
  }, [liveState]);
  React.useLayoutEffect(
    () => () => {
      publishSearchResultsHeaderLiveState(null);
    },
    []
  );
};
