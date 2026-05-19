import type { Coordinate, MapBounds, RestaurantResult, SearchResponse } from '../../../../types';
import type {
  CameraSnapshot,
  ProfileTransitionSnapshotCapture,
  ProfileTransitionStatus,
  RestaurantFocusSession,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

export type SearchProfileSource =
  | 'results_sheet'
  | 'auto_open_single_candidate'
  | 'autocomplete'
  | 'dish_card';

export type ProfilePreviewOpenOptions = {
  pressedCoordinate?: Coordinate | null;
  forceMiddleSnap?: boolean;
};

export type ProfileOpenOptions = ProfilePreviewOpenOptions & {
  source?: SearchProfileSource;
};

export type CloseRestaurantProfileOptions = {
  dismissBehavior?: 'restore' | 'clear';
  clearSearchOnDismiss?: boolean;
};

export type RestaurantProfileLocation = {
  locationId: string;
  latitude: number;
  longitude: number;
};

export type ProfilePreviewActionModel = {
  transitionStatus: ProfileTransitionStatus;
  currentZoom: number | null;
  currentLastCameraState: { center: [number, number]; zoom: number } | null;
  profilePadding: CameraSnapshot['padding'];
};

export type ProfileRestaurantCameraActionModel = {
  profilePadding: CameraSnapshot['padding'];
  restaurantLocations: RestaurantProfileLocation[];
  locationSelectionAnchor: Coordinate | null;
  previousFocusSession: RestaurantFocusSession;
  currentLastCameraState: { center: [number, number]; zoom: number } | null;
  currentViewportBounds: MapBounds | null;
  currentMapZoom: number | null;
  fallbackZoom: number;
  multiLocationZoomBaseline: number | null;
  profileMultiLocationMinZoom: number;
  restaurantFocusCenterEpsilon: number;
  restaurantFocusZoomEpsilon: number;
  pickClosestLocationToCenter: (
    locations: RestaurantProfileLocation[],
    center: Coordinate | null
  ) => RestaurantProfileLocation | null;
  pickPreferredRestaurantMapLocation: (
    restaurant: RestaurantResult,
    anchor: Coordinate | null
  ) => RestaurantProfileLocation | null;
};

export type ProfileOpenActionModel = {
  transitionStatus: ProfileTransitionStatus;
  currentPanelRestaurantId: string | null;
  restaurantOnlyId: string | null;
  restaurantOnlySearchId: string | null;
  queryLabel: string;
  transitionSnapshotCapture: ProfileTransitionSnapshotCapture;
  restaurantCameraActionModel: ProfileRestaurantCameraActionModel;
};

export type ProfileFocusActionModel = {
  restaurantCameraActionModel: ProfileRestaurantCameraActionModel;
};

export type ProfileRefreshSelectionActionModel = {
  restaurant: RestaurantResult;
  queryLabel: string;
};

export type ProfileCloseActionModel = {
  hasPanelSnapshot: boolean;
  transitionStatus: ProfileTransitionStatus;
  currentRestaurantId: string | null;
  options?: CloseRestaurantProfileOptions;
};

export type ProfileAutoOpenActionModel = {
  results: SearchResponse | null;
  isProfileAutoOpenSuppressed: boolean;
  pendingSelection: { restaurantId: string } | null;
  currentQueryKey: string;
  activeOpenRestaurantId: string | null;
  lastAutoOpenKey: string | null;
};

export type ProfilePreviewActionModelInputs = {
  transitionStatus: ProfileTransitionStatus;
  currentZoom: number | null;
  currentLastCameraState: { center: [number, number]; zoom: number } | null;
  profilePadding: CameraSnapshot['padding'];
};

export type ProfileRestaurantCameraActionModelInputs = {
  locationSelectionAnchor: Coordinate | null;
  previousFocusSession: RestaurantFocusSession;
  currentLastCameraState: { center: [number, number]; zoom: number } | null;
  currentViewportBounds: MapBounds | null;
  currentMapZoom: number | null;
  fallbackZoom: number;
  multiLocationZoomBaseline: number | null;
  profileMultiLocationMinZoom: number;
  restaurantFocusCenterEpsilon: number;
  restaurantFocusZoomEpsilon: number;
  pickClosestLocationToCenter: (
    locations: RestaurantProfileLocation[],
    center: Coordinate | null
  ) => RestaurantProfileLocation | null;
  pickPreferredRestaurantMapLocation: (
    restaurant: RestaurantResult,
    anchor: Coordinate | null
  ) => RestaurantProfileLocation | null;
};

export type ProfileOpenActionModelInputs = {
  transitionStatus: ProfileTransitionStatus;
  currentPanelRestaurantId: string | null;
  restaurantOnlyId: string | null;
  restaurantOnlySearchId: string | null;
  queryLabel: string;
  transitionSnapshotCapture: ProfileTransitionSnapshotCapture;
};
