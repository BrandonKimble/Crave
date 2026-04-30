import type React from 'react';
import type { useSearchFilterModalOwner } from '../../hooks/use-search-filter-modal-owner';
import type useSearchSubmitOwner from '../../hooks/use-search-submit-owner';
import type { useSuggestionInteractionController } from '../../hooks/use-suggestion-interaction-controller';
import {
  pickClosestLocationToCenter as pickClosestRestaurantLocationToCenter,
  pickPreferredRestaurantMapLocation as pickPreferredRestaurantLocation,
  resolveRestaurantLocationSelectionAnchor as resolveRestaurantLocationAnchor,
  resolveRestaurantMapLocations as resolveRestaurantLocations,
} from '../map/restaurant-location-selection';
import type { ProfileOwner } from '../profile/profile-owner-runtime';
import type { SearchMapProfileCommandPort } from './search-map-protocol-contract';
import type { ResultsCloseTransitionActions } from './results-presentation-shell-runtime-contract';
import type { ResultsSheetInteractionModel } from './results-sheet-interaction-contract';
import type { SearchForegroundInteractionRuntime } from './use-search-foreground-interaction-runtime-contract';
import type {
  SearchRootAutocompletePort,
  SearchRootForegroundInputRuntime,
} from './search-root-control-ports-runtime-contract';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';

export type SuggestionInteractionRuntime = ReturnType<typeof useSuggestionInteractionController>;
export type SubmitRuntimeResult = ReturnType<typeof useSearchSubmitOwner>;
export type FilterModalRuntime = ReturnType<typeof useSearchFilterModalOwner> & {
  openNow: boolean;
  priceButtonIsActive: boolean;
  votesFilterActive: boolean;
};
export type ForegroundInteractionRuntime = SearchForegroundInteractionRuntime;

export type SearchRootPresentationStateRuntime = {
  shouldSuspendResultsSheet: boolean;
  shouldFreezeRestaurantPanelContent: boolean;
  shouldDimResultsSheet: boolean;
  shouldDisableResultsSheetInteraction: boolean;
  notifyCloseCollapsedBoundaryReached: () => void;
  shouldSuppressRestaurantOverlay: boolean;
  shouldEnableRestaurantOverlayInteraction: boolean;
};

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

export type SearchRootResultsPresentationControlPort = ResultsPresentationOwner;

export type SearchRootAutocompleteControlPort = SearchRootAutocompletePort;

export type SearchRootResultsPresentationControlLane = {
  resultsPresentationOwner: SearchRootResultsPresentationControlPort;
};

export type SearchRootAutocompleteControlLane = {
  autocompleteControlPort: SearchRootAutocompleteControlPort;
};

export type SearchRootFilterModalControlLane = {
  filterModalRuntime: FilterModalRuntime;
};

export type SearchRootForegroundInteractionControlLane = {
  foregroundInteractionRuntime: ForegroundInteractionRuntime;
};

export type SearchRootForegroundInputControlLane = {
  foregroundInputRuntime: SearchRootForegroundInputRuntime;
};

export type SearchRootViewportShortcutControlLane = {
  submitViewportShortcut: SubmitRuntimeResult['submitViewportShortcut'];
};

export type SearchRootSuggestionInteractionControlLane = {
  suggestionInteractionRuntime: SuggestionInteractionRuntime;
};

export type SearchRootProfilePresentationControlLane = {
  profileOwner: ProfileOwner;
  stableOpenRestaurantProfileFromResults:
    ProfileOwner['profileActions']['openRestaurantProfileFromResults'];
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
};

export type SearchRootMapProfileControlLane = {
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

export type SearchRootResultsSheetControlLane = {
  resultsSheetInteractionModel: ResultsSheetInteractionModel;
};

export type SearchRootResultsPresentationStateControlLane = {
  presentationState: SearchRootPresentationStateRuntime;
};

export type SearchRootResultsTransitionControlLane = {
  closeTransitionActions: ResultsCloseTransitionActions;
};

export type SearchRootPreparedResultsSnapshotControlLane = {
  preparedResultsSnapshotKey: string | null;
};
