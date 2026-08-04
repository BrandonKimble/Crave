import type { OverlaySheetSnap } from '../../../../overlays/types';
import { resolveProfileCameraPadding } from './profile-camera-presentation-runtime';
import type {
  CameraSnapshot,
  ProfileTransitionSnapshotCapture,
  ProfileTransitionState,
  ProfileTransitionStatus,
  RestaurantPanelSnapshot,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import { resolveProfileTransitionSnapshotCapture } from './profile-transition-snapshot-runtime';
import { resolveProfileViewState } from './profile-view-state-runtime';

export type ProfilePresentationModel = {
  transitionStatus: ProfileTransitionState['status'];
  isTransitionAnimating: boolean;
  isOverlayVisible: boolean;
  isPresentationActive: boolean;
  activeOpenRestaurantId: string | null;
};

export type ProfileViewState = {
  presentation: ProfilePresentationModel;
  highlightedRestaurantId: string | null;
  restaurantPanelSnapshot: RestaurantPanelSnapshot | null;
  mapCameraPadding: CameraSnapshot['padding'];
};

export type ProfilePresentationCameraLayoutModel = {
  sheetScrollOffset: { value: number };
  sheetTranslateY: { value: number };
  snapPoints: { expanded: number; middle: number; collapsed: number };
  sheetState: Exclude<OverlaySheetSnap, 'hidden'>;
  mapCenter: [number, number] | null;
  mapZoom: number | null;
  searchBarTop: number;
  searchBarHeight: number;
  insetsTop: number;
  navBarTop: number;
  screenHeight: number;
  profilePinTargetCenterRatio: number;
  profilePinMinVisibleHeight: number;
  fallbackCenter: [number, number];
  fallbackZoom: number;
};

export type CreateProfilePresentationModelRuntimeArgs = {
  profileShellState: {
    transitionStatus: ProfileTransitionStatus;
    hasRestaurantRouteEntry: boolean;
    isRestaurantSwitchInFlight: boolean;
    restaurantPanelSnapshot: RestaurantPanelSnapshot | null;
    mapCameraPadding: CameraSnapshot['padding'];
    mapHighlightedRestaurantId: string | null;
  };
  cameraLayoutModel: ProfilePresentationCameraLayoutModel;
};

export type ProfilePresentationModelRuntime = {
  profileViewState: ProfileViewState;
  resolveProfileCameraPadding: () => CameraSnapshot['padding'];
  getProfileTransitionSnapshotCapture: () => ProfileTransitionSnapshotCapture;
};

export const createProfilePresentationModelRuntime = ({
  profileShellState: {
    transitionStatus,
    hasRestaurantRouteEntry,
    isRestaurantSwitchInFlight,
    restaurantPanelSnapshot,
    mapCameraPadding,
    mapHighlightedRestaurantId: shellMapHighlightedRestaurantId,
  },
  cameraLayoutModel: {
    sheetScrollOffset,
    snapPoints,
    searchBarTop,
    searchBarHeight,
    insetsTop,
    screenHeight,
    profilePinMinVisibleHeight,
  },
}: CreateProfilePresentationModelRuntimeArgs): ProfilePresentationModelRuntime => {
  const getResolvedProfileCameraPadding = (): CameraSnapshot['padding'] =>
    resolveProfileCameraPadding({
      screenHeight,
      searchBarTop,
      searchBarHeight,
      insetsTop,
      middleSnapPoint: snapPoints.middle,
      profilePinMinVisibleHeight,
    });

  return {
    profileViewState: resolveProfileViewState({
      transitionStatus,
      hasRestaurantRouteEntry,
      isRestaurantSwitchInFlight,
      restaurantPanelSnapshot,
      mapCameraPadding,
      mapHighlightedRestaurantId: shellMapHighlightedRestaurantId,
    }),
    resolveProfileCameraPadding: getResolvedProfileCameraPadding,
    getProfileTransitionSnapshotCapture: () =>
      resolveProfileTransitionSnapshotCapture({
        sheetScrollOffset: sheetScrollOffset.value,
      }),
  };
};
