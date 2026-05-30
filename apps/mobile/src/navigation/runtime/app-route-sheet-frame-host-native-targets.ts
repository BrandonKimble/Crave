import { runOnUI, type SharedValue } from 'react-native-reanimated';

import type { SearchRouteSceneStackChromeVisualState } from '../../overlays/searchRouteSceneStackSheetContract';
import type { OverlayHeaderActionMode } from '../../overlays/useOverlayHeaderActionController';
import { EMPTY_SEARCH_ROUTE_SHEET_RESOLVED_VISUAL_SELECTION_SNAPSHOT } from '../../screens/Search/runtime/shared/search-route-sheet-resolved-visual-selection-snapshot-contract';
import type { AppRouteNavSilhouetteSheetExclusionModeValue } from './app-route-nav-silhouette-authority';
import type { AppRouteSheetHostNativeAdapterSnapshot } from './app-route-sheet-host-authority-controller';

export type AppRouteSheetFrameHostNativeSharedValues = {
  sheetExclusionModeValue: SharedValue<AppRouteNavSilhouetteSheetExclusionModeValue>;
  resolvedNavBarHeightValue: SharedValue<number>;
  bottomNavHiddenTranslateYValue: SharedValue<number>;
  navTranslateYValue: SharedValue<number>;
  navBarCutoutProgressValue: SharedValue<number>;
  navBarCutoutHidingProgressValue: SharedValue<number>;
  navBarCutoutIsHidingValue: SharedValue<boolean>;
  headerActionVisibleValue: SharedValue<number>;
  headerActionModeValue: SharedValue<OverlayHeaderActionMode>;
  middleSnapPointValue: SharedValue<number>;
  collapsedSnapPointValue: SharedValue<number>;
};

const DEFAULT_CHROME_VISUAL_STATE =
  EMPTY_SEARCH_ROUTE_SHEET_RESOLVED_VISUAL_SELECTION_SNAPSHOT.resolvedChromeVisualState;

const resolveChromeVisualState = (
  chromeVisualState: SearchRouteSceneStackChromeVisualState | null
): SearchRouteSceneStackChromeVisualState => {
  'worklet';
  return chromeVisualState ?? DEFAULT_CHROME_VISUAL_STATE;
};

const syncSheetFrameHostNativeSharedValuesOnUI = (
  values: AppRouteSheetFrameHostNativeSharedValues,
  snapshot: AppRouteSheetHostNativeAdapterSnapshot
): void => {
  'worklet';
  const chromeVisualState = resolveChromeVisualState(snapshot.chromeVisualState);
  const overlaySheetPolicy = snapshot.frameHostInput.overlaySheetPolicy;
  values.sheetExclusionModeValue.value =
    chromeVisualState.navSilhouetteSheetExclusionModeValue.value;
  values.resolvedNavBarHeightValue.value = Math.max(chromeVisualState.navBarCutoutHeight, 0);
  values.bottomNavHiddenTranslateYValue.value = chromeVisualState.bottomNavHiddenTranslateY;
  values.navTranslateYValue.value = chromeVisualState.navTranslateY.value;
  values.navBarCutoutProgressValue.value = chromeVisualState.navBarCutoutProgress.value;
  values.navBarCutoutHidingProgressValue.value = chromeVisualState.navBarCutoutHidingProgress.value;
  values.navBarCutoutIsHidingValue.value = chromeVisualState.navBarCutoutIsHiding;
  values.headerActionVisibleValue.value = overlaySheetPolicy?.overlaySheetVisible ? 1 : 0;
  values.headerActionModeValue.value =
    overlaySheetPolicy?.overlayHeaderActionMode ?? 'follow-collapse';
  values.middleSnapPointValue.value = snapshot.frameHostInput.middleSnapPoint;
  values.collapsedSnapPointValue.value = snapshot.frameHostInput.collapsedSnapPoint;
};

export const syncSheetFrameHostNativeSharedValues = (
  values: AppRouteSheetFrameHostNativeSharedValues,
  snapshot: AppRouteSheetHostNativeAdapterSnapshot
): void => {
  runOnUI(syncSheetFrameHostNativeSharedValuesOnUI)(values, snapshot);
};
