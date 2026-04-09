import type { ResultsSheetInteractionModel } from './results-sheet-interaction-contract';
import type {
  SearchSessionActionRuntime,
  UseSearchSessionActionRuntimeArgs,
} from './search-session-action-runtime-contract';
import type { useSearchResultsSheetInteractionRuntime } from './use-search-results-sheet-interaction-runtime';

export type SearchRootSessionActionArgs = UseSearchSessionActionRuntimeArgs;

export type SearchRootResultsSheetInteractionArgsRuntime = {
  loadMoreArgs: Omit<
    Parameters<typeof useSearchResultsSheetInteractionRuntime>[0]['loadMoreArgs'],
    'loadMoreResults'
  >;
  interactionStateArgs: Parameters<
    typeof useSearchResultsSheetInteractionRuntime
  >[0]['interactionStateArgs'];
  snapArgs: Parameters<typeof useSearchResultsSheetInteractionRuntime>[0]['snapArgs'];
  resetResultsListScrollProgressRef: Parameters<
    typeof useSearchResultsSheetInteractionRuntime
  >[0]['resetResultsListScrollProgressRef'];
};

export type SearchRootPresentationStateRuntime = {
  shouldSuspendResultsSheet: boolean;
  shouldFreezeRestaurantPanelContent: boolean;
  shouldDimResultsSheet: boolean;
  shouldDisableResultsSheetInteraction: boolean;
  notifyCloseCollapsedBoundaryReached: () => void;
  shouldSuppressRestaurantOverlay: boolean;
  shouldEnableRestaurantOverlayInteraction: boolean;
};

export type SearchRootActionLanes = {
  sessionActionRuntime: SearchSessionActionRuntime;
  resultsSheetInteractionModel: ResultsSheetInteractionModel;
  presentationState: SearchRootPresentationStateRuntime;
};
