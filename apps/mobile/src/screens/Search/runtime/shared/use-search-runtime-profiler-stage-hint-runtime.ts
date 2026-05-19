import React from 'react';

import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import {
  getSearchSurfaceRuntime,
  selectSearchSurfaceVisualPolicy,
} from '../surface/search-surface-runtime';
import { getSearchMountedResultsBodyRuntimeSnapshot } from './search-mounted-results-data-store';

export const useSearchRuntimeProfilerStageHintRuntime = ({
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  isSearchRequestLoadingRef,
}: {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  isSearchRequestLoadingRef: React.MutableRefObject<boolean>;
}) => {
  void resultsPresentationSurfaceAuthority;
  const profilerRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      isLoadingMore: state.isLoadingMore,
    }),
    (left, right) => left.isLoadingMore === right.isLoadingMore,
    ['isLoadingMore'] as const,
    'profiler_stage_hint_state'
  );

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

  return {
    profilerRuntimeState,
    resolveProfilerStageHint,
  };
};
