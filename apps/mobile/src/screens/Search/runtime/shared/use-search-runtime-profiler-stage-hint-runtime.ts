import React from 'react';

import { areResultsPresentationReadModelsEqual } from './results-presentation-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

export const useSearchRuntimeProfilerStageHintRuntime = ({
  searchRuntimeBus,
  isSearchRequestLoadingRef,
}: {
  searchRuntimeBus: SearchRuntimeBus;
  isSearchRequestLoadingRef: React.MutableRefObject<boolean>;
}) => {
  const profilerRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      shouldHydrateResultsForRender: state.shouldHydrateResultsForRender,
      isLoadingMore: state.isLoadingMore,
      resultsPresentation: state.resultsPresentation,
    }),
    (left, right) =>
      left.shouldHydrateResultsForRender === right.shouldHydrateResultsForRender &&
      left.isLoadingMore === right.isLoadingMore &&
      areResultsPresentationReadModelsEqual(
        left.resultsPresentation,
        right.resultsPresentation
      ),
    ['shouldHydrateResultsForRender', 'isLoadingMore', 'resultsPresentation'] as const
  );

  const profilerShouldHydrateResultsForRenderRef = React.useRef(
    profilerRuntimeState.shouldHydrateResultsForRender
  );
  const profilerIsResultsPresentationPendingRef = React.useRef(
    profilerRuntimeState.resultsPresentation.isPending
  );

  React.useEffect(() => {
    profilerIsResultsPresentationPendingRef.current =
      profilerRuntimeState.resultsPresentation.isPending;
  }, [profilerRuntimeState.resultsPresentation]);

  React.useEffect(() => {
    profilerShouldHydrateResultsForRenderRef.current =
      profilerRuntimeState.shouldHydrateResultsForRender;
  }, [profilerRuntimeState.shouldHydrateResultsForRender]);

  const resolveProfilerStageHint = React.useCallback(() => {
    if (profilerShouldHydrateResultsForRenderRef.current) {
      return 'results_hydration_commit';
    }
    if (profilerIsResultsPresentationPendingRef.current) {
      return 'visual_sync_state';
    }
    if (isSearchRequestLoadingRef.current) {
      return 'results_list_materialization';
    }
    return 'post_visual';
  }, [isSearchRequestLoadingRef]);

  return {
    profilerRuntimeState,
    resolveProfilerStageHint,
  };
};
