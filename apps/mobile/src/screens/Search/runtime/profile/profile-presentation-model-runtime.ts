import type { OverlaySheetSnap } from '../../../../overlays/types';
import {
  resolveProfileCameraPadding,
  resolveProfileCameraSnapshot,
} from './profile-camera-presentation-runtime';
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
    restaurantPanelSnapshot: RestaurantPanelSnapshot | null;
    mapCameraPadding: CameraSnapshot['padding'];
    mapHighlightedRestaurantId: string | null;
  };
  cameraLayoutModel: ProfilePresentationCameraLayoutModel;
  getCurrentLastCameraState: () => { center: [number, number]; zoom: number } | null;
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
    restaurantPanelSnapshot,
    mapCameraPadding,
    mapHighlightedRestaurantId: shellMapHighlightedRestaurantId,
  },
  cameraLayoutModel: {
    sheetScrollOffset,
    snapPoints,
    mapCenter,
    mapZoom,
    searchBarTop,
    searchBarHeight,
    insetsTop,
    screenHeight,
    profilePinMinVisibleHeight,
    fallbackCenter,
    fallbackZoom,
  },
  getCurrentLastCameraState,
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

  const captureProfileCameraSnapshot = (): CameraSnapshot | null =>
    resolveProfileCameraSnapshot({
      currentLastCameraState: getCurrentLastCameraState(),
      mapCenter,
      mapZoom,
      fallbackCenter,
      fallbackZoom,
      mapCameraPadding,
    });

  return {
    profileViewState: resolveProfileViewState({
      transitionStatus,
      hasRestaurantRouteEntry,
      restaurantPanelSnapshot,
      mapCameraPadding,
      mapHighlightedRestaurantId: shellMapHighlightedRestaurantId,
    }),
    resolveProfileCameraPadding: getResolvedProfileCameraPadding,
    getProfileTransitionSnapshotCapture: () =>
      resolveProfileTransitionSnapshotCapture({
        cameraSnapshot: captureProfileCameraSnapshot(),
        sheetScrollOffset: sheetScrollOffset.value,
      }),
  };
};
