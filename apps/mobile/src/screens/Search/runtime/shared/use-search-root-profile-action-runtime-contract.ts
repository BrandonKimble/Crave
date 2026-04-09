import React from 'react';

import {
  pickClosestLocationToCenter as pickClosestRestaurantLocationToCenter,
  pickPreferredRestaurantMapLocation as pickPreferredRestaurantLocation,
  resolveRestaurantLocationSelectionAnchor as resolveRestaurantLocationAnchor,
  resolveRestaurantMapLocations as resolveRestaurantLocations,
} from '../map/restaurant-location-selection';
import type useSearchSubmitOwner from '../../hooks/use-search-submit-owner';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';
import type { SearchRootSessionActionArgs } from './search-root-action-runtime-contract';

export type UseSearchRootProfileActionRuntimeArgs = {
  insets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  isSignedIn: boolean;
  userLocation: SearchRootSessionActionArgs['foregroundInteractionArgs']['userLocation'];
  userLocationRef: Parameters<typeof useSearchSubmitOwner>[0]['runtimePorts']['userLocationRef'];
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
};

export type SearchRootProfileOwnerArgs = SearchRootSessionActionArgs['profileOwnerArgs'];

export type SearchRootRestaurantSelectionModel = {
  resolveRestaurantMapLocations: (
    restaurant: Parameters<typeof resolveRestaurantLocations>[0]
  ) => ReturnType<typeof resolveRestaurantLocations>;
  resolveRestaurantLocationSelectionAnchor: () => ReturnType<
    typeof resolveRestaurantLocationAnchor
  >;
  pickPreferredRestaurantMapLocation: (
    restaurant: Parameters<typeof pickPreferredRestaurantLocation>[0],
    anchor: Parameters<typeof pickPreferredRestaurantLocation>[1]
  ) => ReturnType<typeof pickPreferredRestaurantLocation>;
  pickClosestLocationToCenter: (
    locations: ReturnType<typeof resolveRestaurantLocations>,
    center: Parameters<typeof pickClosestRestaurantLocationToCenter>[1]
  ) => ReturnType<typeof pickClosestRestaurantLocationToCenter>;
};

export type SearchRootProfileAppExecutionArgsRuntime = {
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
  appExecutionArgs: SearchRootProfileOwnerArgs['appExecutionArgs'];
};

export type SearchRootProfileActionRuntime = {
  profileOwnerArgs: SearchRootProfileOwnerArgs;
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
  restaurantSelectionModel: Pick<
    SearchRootRestaurantSelectionModel,
    | 'resolveRestaurantMapLocations'
    | 'resolveRestaurantLocationSelectionAnchor'
    | 'pickPreferredRestaurantMapLocation'
  >;
};
