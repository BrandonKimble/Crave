import type { SearchRootActionLanes } from './search-root-action-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootPresentationVisualRuntime } from './use-search-root-presentation-visual-runtime';
import { useSearchRoutePanelPublicationRuntime } from './use-search-route-panel-publication-runtime';

type UseSearchRootSearchRoutePublicationRuntimeArgs = {
  startupPollsSnapshot: Parameters<
    typeof useSearchRoutePanelPublicationRuntime
  >[0]['startupPollsSnapshot'];
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
  presentationVisualRuntime: SearchRootPresentationVisualRuntime;
} & Pick<SearchRootActionLanes, 'sessionActionRuntime' | 'resultsSheetInteractionModel'>;

export const useSearchRootSearchRoutePublicationRuntime = ({
  startupPollsSnapshot,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  sessionActionRuntime,
  resultsSheetInteractionModel,
  presentationVisualRuntime,
}: UseSearchRootSearchRoutePublicationRuntimeArgs): void => {
  useSearchRoutePanelPublicationRuntime({
    resultsPresentationOwner:
      requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
        .resultsPresentationOwner,
    resultsSheetRuntime: rootScaffoldRuntime.resultsSheetRuntimeOwner,
    pollBounds: rootScaffoldRuntime.resultsSheetRuntimeLane.pollBounds,
    startupPollsSnapshot,
    searchInteractionRef: rootSessionRuntime.primitives.searchInteractionRef,
    shouldDisableSearchBlur: false,
    searchFiltersLayoutCacheRef: rootPrimitivesRuntime.searchState.searchFiltersLayoutCacheRef,
    handleSearchFiltersLayoutCache:
      rootPrimitivesRuntime.searchState.handleSearchFiltersLayoutCache,
    scoreMode: rootSessionRuntime.filterStateRuntime.scoreMode,
    getDishSaveHandler: rootSessionRuntime.overlayCommandRuntime.getDishSaveHandler,
    getRestaurantSaveHandler: rootSessionRuntime.overlayCommandRuntime.getRestaurantSaveHandler,
    mapQueryBudget: rootSessionRuntime.runtimeOwner.mapQueryBudget,
    shouldLogResultsViewability:
      rootScaffoldRuntime.instrumentationRuntime.shouldLogResultsViewability,
    onRuntimeMechanismEvent: rootScaffoldRuntime.instrumentationRuntime.emitRuntimeMechanismEvent,
    phaseBMaterializerRef: rootSessionRuntime.runtimeOwner.phaseBMaterializerRef,
    isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    resultsSheetInteractionModel,
    toggleRankSelector: sessionActionRuntime.filterModalRuntime.toggleRankSelector,
    toggleOpenNow: sessionActionRuntime.filterModalRuntime.toggleOpenNow,
    toggleVotesFilter: sessionActionRuntime.filterModalRuntime.toggleVotesFilter,
    togglePriceSelector: sessionActionRuntime.filterModalRuntime.togglePriceSelector,
    stableOpenRestaurantProfileFromResults:
      sessionActionRuntime.stableOpenRestaurantProfileFromResults,
    openScoreInfo: sessionActionRuntime.filterModalRuntime.openScoreInfo,
    shouldRenderSearchOverlay: rootScaffoldRuntime.overlaySessionRuntime.shouldRenderSearchOverlay,
    isForegroundEditing:
      requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
        .resultsPresentationOwner.shellModel.inputMode === 'editing',
    resultsPanelVisualRuntimeModel: presentationVisualRuntime.resultsPanelVisualRuntimeModel,
    visualState: presentationVisualRuntime.searchSheetVisualContextValue,
    shouldFreezeOverlaySheetForCloseHandoff:
      presentationVisualRuntime.shouldFreezeOverlaySheetForCloseHandoff,
    shouldFreezeOverlayHeaderActionForRunOne:
      presentationVisualRuntime.shouldFreezeOverlayHeaderChromeForRunOne,
    overlayHeaderActionProgress:
      presentationVisualRuntime.visualRuntime.overlayHeaderActionProgress,
  });
};
