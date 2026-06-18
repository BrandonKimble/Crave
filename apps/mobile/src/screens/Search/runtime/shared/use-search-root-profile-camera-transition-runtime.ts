import React from 'react';

import { SCREEN_HEIGHT, USA_FALLBACK_CENTER, USA_FALLBACK_ZOOM } from '../../constants/search';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { ProfilePresentationCameraLayoutModel } from '../profile/profile-presentation-model-runtime';

const PROFILE_PIN_TARGET_CENTER_RATIO = 0.25;
const PROFILE_PIN_MIN_VISIBLE_HEIGHT = 160;

export const useSearchRootProfileCameraTransitionRuntime = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  insets,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  insets: SearchRootEnvironment['insets'];
}): ProfilePresentationCameraLayoutModel => {
  const { rootPrimitivesRuntime, rootSuggestionRuntime } = stateFoundationLane;
  const { rootOverlaySessionSurfaceRuntime, appRouteSharedSheetRuntimeOwner } =
    rootOverlayFoundationRuntime;

  return React.useMemo<ProfilePresentationCameraLayoutModel>(
    () => ({
      sheetScrollOffset: appRouteSharedSheetRuntimeOwner.sheetScrollOffset,
      sheetTranslateY: appRouteSharedSheetRuntimeOwner.sheetTranslateY,
      snapPoints: {
        expanded: appRouteSharedSheetRuntimeOwner.snapPoints.expanded,
        middle: appRouteSharedSheetRuntimeOwner.snapPoints.middle,
        collapsed: appRouteSharedSheetRuntimeOwner.snapPoints.collapsed,
      },
      sheetState:
        appRouteSharedSheetRuntimeOwner.sheetState === 'hidden'
          ? 'collapsed'
          : appRouteSharedSheetRuntimeOwner.sheetState,
      mapCenter: rootPrimitivesRuntime.mapState.mapCenter,
      mapZoom: rootPrimitivesRuntime.mapState.mapZoom,
      searchBarTop: rootOverlaySessionSurfaceRuntime.searchBarTop,
      searchBarHeight: rootSuggestionRuntime.searchBarFrame?.height ?? 0,
      insetsTop: insets.top,
      navBarTop: rootOverlaySessionSurfaceRuntime.navBarTopForSnaps,
      screenHeight: SCREEN_HEIGHT,
      profilePinTargetCenterRatio: PROFILE_PIN_TARGET_CENTER_RATIO,
      profilePinMinVisibleHeight: PROFILE_PIN_MIN_VISIBLE_HEIGHT,
      fallbackCenter: USA_FALLBACK_CENTER,
      fallbackZoom: USA_FALLBACK_ZOOM,
    }),
    [
      insets.top,
      rootOverlaySessionSurfaceRuntime.navBarTopForSnaps,
      rootOverlaySessionSurfaceRuntime.searchBarTop,
      rootPrimitivesRuntime.mapState.mapCenter,
      rootPrimitivesRuntime.mapState.mapZoom,
      appRouteSharedSheetRuntimeOwner.sheetScrollOffset,
      appRouteSharedSheetRuntimeOwner.sheetState,
      appRouteSharedSheetRuntimeOwner.sheetTranslateY,
      appRouteSharedSheetRuntimeOwner.snapPoints.collapsed,
      appRouteSharedSheetRuntimeOwner.snapPoints.expanded,
      appRouteSharedSheetRuntimeOwner.snapPoints.middle,
      rootSuggestionRuntime.searchBarFrame?.height,
    ]
  );
};
