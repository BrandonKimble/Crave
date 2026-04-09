import type { FoodResult, RestaurantResult } from '../../../../types';
import type { PreparedProfilePresentationSnapshot } from '../shared/prepared-presentation-transaction';
import type { PreparedProfilePresentationTransaction } from './profile-prepared-presentation-transaction-contract';

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

export type RestaurantProfileShellData = HydratedRestaurantProfile & {
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
  savedSheetSnap: 'expanded' | 'middle' | 'collapsed' | null;
  savedCamera: CameraSnapshot | null;
  savedResultsScrollOffset: number | null;
};

export type ProfileOpenSettleState = {
  transactionId: string | null;
  requestToken: number | null;
  cameraSettled: boolean;
  sheetSettled: boolean;
};

export type ProfileDismissCompletionState = {
  requestToken: number | null;
  handled: boolean;
};

export type ProfilePresentationCompletionState = {
  preparedTransaction: PreparedProfilePresentationTransaction | null;
  dismiss: ProfileDismissCompletionState;
  openSettle: ProfileOpenSettleState;
};

export type ProfileTransitionState = {
  status: ProfileTransitionStatus;
  preparedSnapshot: PreparedProfilePresentationSnapshot | null;
  completionState: ProfilePresentationCompletionState;
  savedSheetSnap: 'expanded' | 'middle' | 'collapsed' | null;
  savedCamera: CameraSnapshot | null;
  savedResultsScrollOffset: number | null;
};

export type ProfileForegroundUiRestoreState = unknown;
