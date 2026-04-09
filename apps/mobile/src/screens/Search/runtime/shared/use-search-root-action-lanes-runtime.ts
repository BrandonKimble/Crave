import type { SearchRootActionLanes } from './search-root-action-runtime-contract';
import type { SearchRootProfileActionRuntime } from './use-search-root-profile-action-runtime-contract';
import type { UseSearchRootRuntimeArgs } from './use-search-root-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';
import { useSearchRootResultsPublicationOwnerRuntime } from './use-search-root-results-publication-owner-runtime';
import { useSearchRootSessionActionOwnerRuntime } from './use-search-root-session-action-owner-runtime';

type UseSearchRootActionLanesRuntimeArgs = Pick<
  UseSearchRootRuntimeArgs,
  | 'insets'
  | 'isSignedIn'
  | 'userLocation'
  | 'userLocationRef'
  | 'navigation'
  | 'routeSearchIntent'
  | 'activeMainIntent'
  | 'consumeActiveMainIntent'
> & {
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
};

export type SearchRootActionLanesRuntime = SearchRootActionLanes & {
  pendingMarkerOpenAnimationFrameRef: SearchRootProfileActionRuntime['pendingMarkerOpenAnimationFrameRef'];
  restaurantSelectionModel: SearchRootProfileActionRuntime['restaurantSelectionModel'];
};

export const useSearchRootActionLanesRuntime = ({
  insets,
  isSignedIn,
  userLocation,
  userLocationRef,
  navigation,
  routeSearchIntent,
  activeMainIntent,
  consumeActiveMainIntent,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
}: UseSearchRootActionLanesRuntimeArgs): SearchRootActionLanesRuntime => {
  const { resetResultsListScrollProgressRef } = requestLaneRuntime;

  const sessionActionOwnerRuntime = useSearchRootSessionActionOwnerRuntime({
    insets,
    isSignedIn,
    userLocation,
    userLocationRef,
    navigation,
    routeSearchIntent,
    activeMainIntent,
    consumeActiveMainIntent,
    rootSessionRuntime,
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
  });
  const { sessionActionRuntime, pendingMarkerOpenAnimationFrameRef, restaurantSelectionModel } =
    sessionActionOwnerRuntime;

  const { resultsSheetInteractionModel, presentationState } =
    useSearchRootResultsPublicationOwnerRuntime({
      sessionActionOwnerRuntime,
      rootSessionRuntime,
      rootPrimitivesRuntime,
      rootSuggestionRuntime,
      rootScaffoldRuntime,
      resetResultsListScrollProgressRef,
    });

  return {
    sessionActionRuntime,
    resultsSheetInteractionModel,
    presentationState,
    pendingMarkerOpenAnimationFrameRef,
    restaurantSelectionModel,
  };
};
