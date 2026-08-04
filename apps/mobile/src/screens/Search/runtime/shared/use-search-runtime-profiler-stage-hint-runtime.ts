import React from 'react';

import type { ResultsPresentationAuthority } from './results-presentation-authority';
import {
  getSearchSurfaceRuntime,
  selectSearchSurfaceVisualPolicy,
} from '../surface/search-surface-runtime';
import { getSearchMountedResultsBodyRuntimeSnapshot } from './search-mounted-results-data-store';

export const useSearchRuntimeProfilerStageHintRuntime = ({
  resultsPresentationAuthority,
  isSearchRequestLoadingRef,
}: {
  resultsPresentationAuthority: ResultsPresentationAuthority;
  isSearchRequestLoadingRef: React.MutableRefObject<boolean>;
}) => {
  // F1312: a live `useSearchRuntimeBusSelector` subscription on ['isLoadingMore'] used to sit
  // here, returned as `profilerRuntimeState` — and NOTHING read it. It was a real
  // useSyncExternalStore subscription that re-rendered this instrumentation runtime on every
  // isLoadingMore flip so a value nobody consumed could be recomputed. Instrumentation that
  // costs renders and reports nothing is worse than no instrumentation.
  //
  // F1317: `resultsPresentationSurfaceAuthority` and `searchRuntimeBus` were the discarded
  // parameters that fed it (`void resultsPresentationSurfaceAuthority;`) — both are gone from
  // the signature rather than silenced.
  const resolveProfilerStageHint = React.useCallback(() => {
    const searchSurfacePolicy = selectSearchSurfaceVisualPolicy(
      getSearchSurfaceRuntime().getSnapshot()
    );
    if (
      searchSurfacePolicy.phase === 'results_redrawing' ||
      searchSurfacePolicy.phase === 'results_dismissing'
    ) {
      return 'visual_sync_state';
    }
    if (getSearchMountedResultsBodyRuntimeSnapshot().shouldHydrateResultsForRender) {
      return 'results_hydration_commit';
    }
    if (resultsPresentationAuthority.getSnapshot().resultsPresentation.isPending) {
      return 'visual_sync_state';
    }
    if (isSearchRequestLoadingRef.current) {
      return 'results_list_materialization';
    }
    return 'post_visual';
  }, [isSearchRequestLoadingRef, resultsPresentationAuthority]);

  return { resolveProfilerStageHint };
};
