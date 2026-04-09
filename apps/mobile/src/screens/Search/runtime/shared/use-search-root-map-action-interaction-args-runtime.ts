import type {
  SearchRootMapInteractionArgsRuntime,
  UseSearchRootMapDisplayRuntimeArgs,
} from './use-search-root-map-display-runtime-contract';

export type SearchRootMapActionInteractionArgsRuntime = {
  interactionArgs: Pick<
    SearchRootMapInteractionArgsRuntime['interactionArgs'],
    | 'isProfilePresentationActive'
    | 'clearMapHighlightedRestaurantId'
    | 'shouldDisableResultsSheetInteraction'
    | 'dismissSearchKeyboard'
  >;
};

export const useSearchRootMapActionInteractionArgsRuntime = ({
  sessionActionRuntime,
  presentationState,
}: Pick<
  UseSearchRootMapDisplayRuntimeArgs,
  'sessionActionRuntime' | 'presentationState'
>): SearchRootMapActionInteractionArgsRuntime => {
  return {
    interactionArgs: {
      isProfilePresentationActive:
        sessionActionRuntime.profileOwner.profileViewState.presentation.isPresentationActive,
      clearMapHighlightedRestaurantId:
        sessionActionRuntime.profileOwner.profileActions.clearMapHighlightedRestaurantId,
      shouldDisableResultsSheetInteraction: presentationState.shouldDisableResultsSheetInteraction,
      dismissSearchKeyboard:
        sessionActionRuntime.suggestionInteractionRuntime.dismissSearchKeyboard,
    },
  };
};
