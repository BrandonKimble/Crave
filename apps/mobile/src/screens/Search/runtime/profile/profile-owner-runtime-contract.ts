import type { BottomSheetProgrammaticRuntimeModel } from '../../../../overlays/useBottomSheetRuntime';
import type { Coordinate, RestaurantResult } from '../../../../types';
import type { SearchRuntimeBus } from '../shared/search-runtime-bus';
import type { ProfileAppExecutionArgs } from './profile-app-execution-runtime-contract';
import type {
  CloseRestaurantProfileOptions,
  ProfileOpenOptions,
  ProfilePreviewOpenOptions,
  RestaurantProfileLocation,
  SearchProfileSource,
} from './profile-action-model-contract';
import type {
  ProfilePresentationCameraLayoutModel,
  ProfileViewState,
} from './profile-presentation-model-runtime';
import type { ProfileNativeExecutionArgs } from './profile-native-execution-runtime-contract';

export type ProfileOwnerNativeExecutionArgs = Omit<
  ProfileNativeExecutionArgs,
  'preparedProfileCompletionHandlerRef'
>;

export type ProfileRuntimeActions = {
  clearMapHighlightedRestaurantId: () => void;
  hydrateRestaurantProfileById: (restaurantId: string, marketKey?: string | null) => void;
  focusRestaurantProfileCamera: (
    restaurant: RestaurantResult,
    source: SearchProfileSource,
    options?: {
      pressedCoordinate?: Coordinate | null;
      preferPressedCoordinate?: boolean;
    }
  ) => void;
  openRestaurantProfilePreview: (
    restaurantId: string,
    restaurantName: string,
    options?: ProfilePreviewOpenOptions
  ) => void;
  openRestaurantProfile: (restaurant: RestaurantResult, options?: ProfileOpenOptions) => void;
  openRestaurantProfileFromResults: (
    restaurant: RestaurantResult,
    source?: 'results_sheet' | 'auto_open_single_candidate' | 'dish_card'
  ) => void;
  refreshOpenRestaurantProfileSelection: (restaurant: RestaurantResult, queryLabel: string) => void;
  resetRestaurantProfileFocusSession: () => void;
  closeRestaurantProfile: (options?: CloseRestaurantProfileOptions) => void;
};

export type ProfileSearchContext = {
  searchRuntimeBus: SearchRuntimeBus;
  trimmedQuery: string;
  restaurantOnlyId: string | null;
  isProfileAutoOpenSuppressed: boolean;
  getPendingRestaurantSelection: () => { restaurantId: string } | null;
  clearPendingRestaurantSelection: () => void;
  getRestaurantOnlySearchId: () => string | null;
};

export type ProfileSelectionModel = {
  resolveRestaurantMapLocations: (restaurant: RestaurantResult) => RestaurantProfileLocation[];
  resolveRestaurantLocationSelectionAnchor: () => { lng: number; lat: number } | null;
  pickClosestLocationToCenter: (
    locations: RestaurantProfileLocation[],
    center: { lng: number; lat: number } | null
  ) => RestaurantProfileLocation | null;
  pickPreferredRestaurantMapLocation: (
    restaurant: RestaurantResult,
    anchor: { lng: number; lat: number } | null
  ) => RestaurantProfileLocation | null;
  profileMultiLocationZoomOutDelta: number;
  profileMultiLocationMinZoom: number;
  restaurantFocusCenterEpsilon: number;
  restaurantFocusZoomEpsilon: number;
};

export type ProfileAnalyticsModel = {
  deferRecentlyViewedTrack: (restaurantId: string, restaurantName: string) => void;
  recordRestaurantView: (restaurantId: string, source: SearchProfileSource) => Promise<void>;
};

export type UseProfileOwnerArgs = {
  searchContext: ProfileSearchContext;
  cameraTransitionPorts: ProfilePresentationCameraLayoutModel;
  selectionModel: ProfileSelectionModel;
  analyticsModel: ProfileAnalyticsModel;
  nativeExecutionArgs: ProfileOwnerNativeExecutionArgs;
  appExecutionArgs: ProfileAppExecutionArgs;
};

export type ProfileOwner = {
  profileViewState: ProfileViewState;
  restaurantSheetSnapController: BottomSheetProgrammaticRuntimeModel['snapController'];
  profileActions: ProfileRuntimeActions;
};
