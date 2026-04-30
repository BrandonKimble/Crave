import { runOnUI, type SharedValue } from 'react-native-reanimated';

import type { SearchRouteOverlaySheetPolicy } from '../../overlays/searchRouteOverlayRuntimeContract';
import type { SearchRouteSceneStackChromeVisualState } from '../../overlays/searchRouteSceneStackSheetContract';
import type { OverlayHeaderActionMode } from '../../overlays/useOverlayHeaderActionController';
import { EMPTY_SEARCH_ROUTE_SHEET_RESOLVED_VISUAL_SELECTION_SNAPSHOT } from '../../screens/Search/runtime/shared/search-route-sheet-resolved-visual-selection-snapshot-contract';
import type { AppRouteSheetHostNativeAdapterSnapshot } from './app-route-sheet-host-authority-controller';
import type { SearchRouteSheetFrameHostInput } from './search-route-sheet-surface-state-runtime-contract';

export type AppRouteSheetFrameHostNativeSharedValues = {
  applyNavBarCutoutValue: SharedValue<number>;
  resolvedNavBarHeightValue: SharedValue<number>;
  bottomNavHiddenTranslateYValue: SharedValue<number>;
  navBarCutoutProgressValue: SharedValue<number>;
  navBarCutoutIsHidingValue: SharedValue<number>;
  headerActionVisibleValue: SharedValue<number>;
  headerActionModeValue: SharedValue<OverlayHeaderActionMode>;
  middleSnapPointValue: SharedValue<number>;
  collapsedSnapPointValue: SharedValue<number>;
};

const HIDDEN_OVERLAY_SHEET_POLICY: SearchRouteOverlaySheetPolicy = {
  overlaySheetVisible: false,
  overlaySheetApplyNavBarCutout: false,
  overlayHeaderActionMode: 'follow-collapse',
};

const FALLBACK_CHROME_VISUAL_STATE =
  EMPTY_SEARCH_ROUTE_SHEET_RESOLVED_VISUAL_SELECTION_SNAPSHOT.resolvedChromeVisualState;

const resolvePolicy = (
  frameHostInput: SearchRouteSheetFrameHostInput
): SearchRouteOverlaySheetPolicy => {
  'worklet';
  return frameHostInput.overlaySheetPolicy ?? HIDDEN_OVERLAY_SHEET_POLICY;
};

const resolveChromeVisualState = (
  chromeVisualState: SearchRouteSceneStackChromeVisualState | null
): SearchRouteSceneStackChromeVisualState => {
  'worklet';
  return chromeVisualState ?? FALLBACK_CHROME_VISUAL_STATE;
};

const syncSheetFrameHostNativeSharedValuesOnUI = (
  values: AppRouteSheetFrameHostNativeSharedValues,
  snapshot: AppRouteSheetHostNativeAdapterSnapshot
): void => {
  'worklet';
  const overlaySheetPolicy = resolvePolicy(snapshot.frameHostInput);
  const chromeVisualState = resolveChromeVisualState(snapshot.chromeVisualState);
  values.applyNavBarCutoutValue.value = overlaySheetPolicy.overlaySheetApplyNavBarCutout ? 1 : 0;
  values.resolvedNavBarHeightValue.value = Math.max(chromeVisualState.navBarCutoutHeight, 0);
  values.bottomNavHiddenTranslateYValue.value = chromeVisualState.bottomNavHiddenTranslateY;
  values.navBarCutoutProgressValue.value = chromeVisualState.navBarCutoutProgress.value;
  values.navBarCutoutIsHidingValue.value = chromeVisualState.navBarCutoutIsHiding ? 1 : 0;
  values.headerActionVisibleValue.value = overlaySheetPolicy.overlaySheetVisible ? 1 : 0;
  values.headerActionModeValue.value = overlaySheetPolicy.overlayHeaderActionMode;
  values.middleSnapPointValue.value = snapshot.frameHostInput.middleSnapPoint;
  values.collapsedSnapPointValue.value = snapshot.frameHostInput.collapsedSnapPoint;
};

export const syncSheetFrameHostNativeSharedValues = (
  values: AppRouteSheetFrameHostNativeSharedValues,
  snapshot: AppRouteSheetHostNativeAdapterSnapshot
): void => {
  runOnUI(syncSheetFrameHostNativeSharedValuesOnUI)(values, snapshot);
};
