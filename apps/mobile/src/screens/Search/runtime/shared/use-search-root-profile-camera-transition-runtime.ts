import React from 'react';

import {
  SCREEN_HEIGHT,
  USA_FALLBACK_CENTER,
  USA_FALLBACK_ZOOM,
} from '../../constants/search';
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
  const {
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
  } = stateFoundationLane;
  const {
    rootOverlaySessionSurfaceRuntime,
    appRouteResultsSheetRuntimeOwner,
  } = rootOverlayFoundationRuntime;

  return React.useMemo<ProfilePresentationCameraLayoutModel>(
    () => ({
      resultsScrollOffset: appRouteResultsSheetRuntimeOwner.resultsScrollOffset,
      sheetTranslateY: appRouteResultsSheetRuntimeOwner.sheetTranslateY,
      snapPoints: {
        expanded: appRouteResultsSheetRuntimeOwner.snapPoints.expanded,
        middle: appRouteResultsSheetRuntimeOwner.snapPoints.middle,
        collapsed: appRouteResultsSheetRuntimeOwner.snapPoints.collapsed,
      },
      sheetState:
        appRouteResultsSheetRuntimeOwner.sheetState === 'hidden'
          ? 'collapsed'
          : appRouteResultsSheetRuntimeOwner.sheetState,
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
      appRouteResultsSheetRuntimeOwner.resultsScrollOffset,
      appRouteResultsSheetRuntimeOwner.sheetState,
      appRouteResultsSheetRuntimeOwner.sheetTranslateY,
      appRouteResultsSheetRuntimeOwner.snapPoints.collapsed,
      appRouteResultsSheetRuntimeOwner.snapPoints.expanded,
      appRouteResultsSheetRuntimeOwner.snapPoints.middle,
      rootSuggestionRuntime.searchBarFrame?.height,
    ]
  );
};
