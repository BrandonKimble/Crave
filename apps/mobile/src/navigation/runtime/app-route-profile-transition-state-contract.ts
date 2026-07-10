import type { FoodResult, RestaurantResult, RestaurantResultScorePreview } from '../../types';

export type ProfileTransitionStatus = 'idle' | 'opening' | 'open' | 'closing';

export type MapCameraPadding = {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
};

export type RestaurantFocusSession = {
  restaurantId: string | null;
  locationKey: string | null;
  hasAppliedInitialMultiLocationZoomOut: boolean;
};

export type HydratedRestaurantProfile = {
  restaurant: RestaurantResult;
  dishes: FoodResult[];
};

export type RestaurantProfileSeed = RestaurantResult | RestaurantResultScorePreview;

export type RestaurantProfileShellData = {
  restaurant: RestaurantProfileSeed;
  dishes: FoodResult[];
  queryLabel: string;
  isFavorite: boolean;
  isLoading?: boolean;
};

export type RestaurantPanelSnapshot = RestaurantProfileShellData;

export type CameraSnapshot = {
  center: [number, number];
  zoom: number;
  padding: MapCameraPadding | null;
};

export type ProfileTransitionSnapshotCapture = {
  savedCamera: CameraSnapshot | null;
  savedResultsScrollOffset: number | null;
};

// L3 slice 4: the machine's preparedSnapshot/completionState (settle ledger) fields are
// DELETED — the transition state is now the small honest record the pop-teardown owner
// reads: an interim status flag + the saved presentation the restore consumes.
export type ProfileTransitionState = {
  status: ProfileTransitionStatus;
  savedCamera: CameraSnapshot | null;
  savedResultsScrollOffset: number | null;
};

export type ProfileForegroundUiRestoreState = unknown;
