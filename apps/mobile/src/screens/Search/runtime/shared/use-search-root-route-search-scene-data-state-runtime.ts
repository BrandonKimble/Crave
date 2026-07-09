import { retrySearchDesiredResolution } from './search-desired-state-writer';
import type {
  SearchRootRouteSearchSceneDataRuntimeArgs,
  SearchRootRuntimeRouteSearchSceneDataStateRuntime,
} from './route-search-scene-runtime-contract';
import { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import { useSearchResultsPanelHydrationRuntimeState } from './use-search-results-panel-hydration-runtime-state';
import { useSearchResultsPanelOnDemandNoticeRuntime } from './use-search-results-panel-on-demand-notice-runtime';
import { useSearchResultsPanelOnDemandQueryRuntime } from './use-search-results-panel-on-demand-query-runtime';
import { useSearchResultsPanelPresentationRuntimeState } from './use-search-results-panel-presentation-runtime-state';
import { useSearchResultsPanelResultsRuntimeState } from './use-search-results-panel-results-runtime-state';
import { useSearchResultsPanelRetainedResultsRuntime } from './use-search-results-panel-retained-results-runtime';
import React from 'react';

export const useSearchRootRouteSearchSceneDataStateRuntime = ({
  sessionAssemblyRuntime,
  routeSceneSwitchAuthority,
  controlAuthorityRuntime,
  readModelPolicyWriters,
}: Pick<
  SearchRootRouteSearchSceneDataRuntimeArgs,
  | 'sessionAssemblyRuntime'
  | 'routeSceneSwitchAuthority'
  | 'controlAuthorityRuntime'
  | 'readModelPolicyWriters'
>): SearchRootRuntimeRouteSearchSceneDataStateRuntime => {
  const routeSearchSceneResultsPresentationOwner =
    controlAuthorityRuntime.presentationAuthorityRuntime.resultsPresentationControlLane
      .resultsPresentationOwner;
  const routeSearchSceneSearchSheetContentLane =
    routeSearchSceneResultsPresentationOwner.shellModel.searchSheetContentLane;
  const routeSearchSceneHandleCloseResults =
    routeSearchSceneResultsPresentationOwner.presentationActions.handleCloseResults;
  const routeSearchSceneScheduleTabToggleCommit =
    routeSearchSceneResultsPresentationOwner.interactionModel.scheduleTabToggleCommit;
  const routeSearchSceneResultsRuntimeState = useSearchResultsPanelResultsRuntimeState(
    sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.searchRuntimeBus
  );
  const routeSearchSceneHydrationRuntimeState = useSearchResultsPanelHydrationRuntimeState(
    sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.searchRuntimeBus,
    sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.resultsPresentationSurfaceAuthority
  );
  const routeSearchScenePresentationRuntimeState = useSearchResultsPanelPresentationRuntimeState(
    sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.searchRuntimeBus,
    sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.resultsPresentationAuthority
  );
  const isSearchSceneRenderAdmitted = React.useCallback(() => {
    const snapshot = routeSceneSwitchAuthority.getSnapshot();
    return (
      snapshot.routeActiveSceneKey === 'search' &&
      snapshot.interactiveSceneKey === 'search' &&
      snapshot.transitionPhase === 'idle' &&
      snapshot.isInteractive
    );
  }, [routeSceneSwitchAuthority]);
  const routeSearchSceneResolvedResultsRuntime = useSearchResultsPanelRetainedResultsRuntime({
    results: routeSearchSceneResultsRuntimeState.results,
    searchSheetContentLane: routeSearchSceneSearchSheetContentLane,
    retainedResultsWriter: readModelPolicyWriters.retainedResults,
  });
  const routeSearchSceneHydrationKeyRuntime = useSearchResultsPanelHydrationKeyRuntime({
    resultsPresentationSurfaceAuthority:
      sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.resultsPresentationSurfaceAuthority,
    resultsRuntimeState: routeSearchSceneResultsRuntimeState,
    isSearchSceneRenderAdmitted,
  });
  const routeSearchSceneOnDemandQueryRuntime = useSearchResultsPanelOnDemandQueryRuntime({
    resolvedResults: routeSearchSceneResolvedResultsRuntime.resolvedResults,
    submittedQuery: routeSearchSceneResultsRuntimeState.submittedQuery,
  });
  const routeSearchSceneOnDemandNotice = useSearchResultsPanelOnDemandNoticeRuntime({
    resolvedResults: routeSearchSceneResolvedResultsRuntime.resolvedResults,
    onDemandNoticeQuery: routeSearchSceneOnDemandQueryRuntime.onDemandNoticeQuery,
  });

  const routeSearchSceneRetryResolution = React.useCallback(() => {
    retrySearchDesiredResolution(
      sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.searchRuntimeBus
    );
  }, [sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.searchRuntimeBus]);

  return {
    routeSearchSceneRetryResolution,
    routeSearchSceneSearchSheetContentLane,
    routeSearchSceneHandleCloseResults,
    routeSearchSceneScheduleTabToggleCommit,
    routeSearchSceneResultsRuntimeState,
    routeSearchSceneHydrationRuntimeState,
    routeSearchScenePresentationRuntimeState,
    routeSearchSceneResolvedResultsRuntime,
    routeSearchSceneHydrationKeyRuntime,
    routeSearchSceneOnDemandNotice,
  };
};
