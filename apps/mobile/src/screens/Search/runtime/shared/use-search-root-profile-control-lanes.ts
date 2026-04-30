import React from 'react';

import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchMapProfileCommandPort } from './search-map-protocol-contract';
import type {
  SearchRootMapProfileControlLane,
  SearchRootProfilePresentationControlLane,
  SearchRootRestaurantSelectionModel,
  SearchRootSuggestionInteractionControlLane,
  SuggestionInteractionRuntime,
} from './use-search-root-control-plane-runtime-contract';

export const useSearchRootSuggestionInteractionControlLane = (
  suggestionInteractionRuntime: SuggestionInteractionRuntime
): SearchRootSuggestionInteractionControlLane =>
  React.useMemo(
    () => ({
      suggestionInteractionRuntime,
    }),
    [suggestionInteractionRuntime]
  );

type UseSearchRootProfilePresentationControlLaneArgs = {
  profileOwner: ProfileOwner;
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
};

export const useSearchRootProfilePresentationControlLane = ({
  profileOwner,
  pendingMarkerOpenAnimationFrameRef,
}: UseSearchRootProfilePresentationControlLaneArgs): SearchRootProfilePresentationControlLane =>
  React.useMemo(
    () => ({
      profileOwner,
      stableOpenRestaurantProfileFromResults:
        profileOwner.profileActions.openRestaurantProfileFromResults,
      pendingMarkerOpenAnimationFrameRef,
    }),
    [profileOwner, pendingMarkerOpenAnimationFrameRef]
  );

type UseSearchRootMapProfileControlLaneArgs = {
  mapProfileCommandPort: SearchMapProfileCommandPort;
  mapViewState: Pick<
    ProfileOwner['profileViewState'],
    'highlightedRestaurantId' | 'mapCameraPadding'
  >;
  restaurantSelectionModel: Pick<
    SearchRootRestaurantSelectionModel,
    | 'resolveRestaurantMapLocations'
    | 'resolveRestaurantLocationSelectionAnchor'
    | 'pickPreferredRestaurantMapLocation'
  >;
};

export const useSearchRootMapProfileControlLane = ({
  mapProfileCommandPort,
  mapViewState,
  restaurantSelectionModel,
}: UseSearchRootMapProfileControlLaneArgs): SearchRootMapProfileControlLane =>
  React.useMemo(
    () => ({
      mapProfileCommandPort,
      mapViewState,
      restaurantSelectionModel,
    }),
    [mapProfileCommandPort, mapViewState, restaurantSelectionModel]
  );
