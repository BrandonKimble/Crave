import React from 'react';
import { useAnimatedReaction, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import type { SearchRouteSceneStackSheetSurfaceProps } from './searchRouteSceneStackSheetContract';
import { useOverlayHeaderActionController } from './useOverlayHeaderActionController';

type UseSearchRouteSceneStackSheetChromeRuntimeArgs = Pick<
  SearchRouteSceneStackSheetSurfaceProps,
  'overlaySheetPolicy' | 'chromeVisualState'
> & {
  middleSnapPoint: number;
  collapsedSnapPoint: number;
  sheetY: SearchRouteSceneStackSheetSurfaceProps['presentationState']['sheetTranslateY'];
};

export const useSearchRouteSceneStackSheetChromeRuntime = ({
  overlaySheetPolicy,
  chromeVisualState,
  middleSnapPoint,
  collapsedSnapPoint,
  sheetY,
}: UseSearchRouteSceneStackSheetChromeRuntimeArgs) => {
  const visible = overlaySheetPolicy.overlaySheetVisible;
  const applyNavBarCutout = overlaySheetPolicy.overlaySheetApplyNavBarCutout;
  const resolvedNavBarHeight = Math.max(chromeVisualState.navBarCutoutHeight, 0);
  const applyNavBarCutoutValue = useSharedValue(applyNavBarCutout ? 1 : 0);
  const resolvedNavBarHeightValue = useSharedValue(resolvedNavBarHeight);
  const bottomNavHiddenTranslateYValue = useSharedValue(
    chromeVisualState.bottomNavHiddenTranslateY
  );
  const navBarCutoutIsHidingValue = useSharedValue(chromeVisualState.navBarCutoutIsHiding ? 1 : 0);
  const navBarCutoutProgressValue = useSharedValue(0);

  React.useEffect(() => {
    applyNavBarCutoutValue.value = applyNavBarCutout ? 1 : 0;
    resolvedNavBarHeightValue.value = resolvedNavBarHeight;
    bottomNavHiddenTranslateYValue.value = chromeVisualState.bottomNavHiddenTranslateY;
    navBarCutoutIsHidingValue.value = chromeVisualState.navBarCutoutIsHiding ? 1 : 0;
  }, [
    applyNavBarCutout,
    applyNavBarCutoutValue,
    bottomNavHiddenTranslateYValue,
    chromeVisualState.bottomNavHiddenTranslateY,
    chromeVisualState.navBarCutoutIsHiding,
    navBarCutoutIsHidingValue,
    resolvedNavBarHeight,
    resolvedNavBarHeightValue,
  ]);

  useAnimatedReaction(
    () => chromeVisualState.navBarCutoutProgress.value,
    (progress) => {
      navBarCutoutProgressValue.value = progress;
    },
    [chromeVisualState.navBarCutoutProgress]
  );

  const sheetClipAnimatedStyle = useAnimatedStyle(() => {
    if (applyNavBarCutoutValue.value === 0) {
      return { bottom: 0 };
    }
    const resolvedHeight = Math.max(0, resolvedNavBarHeightValue.value);
    const progress = Math.max(0, Math.min(1, navBarCutoutProgressValue.value));
    const navTranslateY = Math.max(
      0,
      (1 - progress) * Math.max(0, bottomNavHiddenTranslateYValue.value)
    );
    const hideLead = navBarCutoutIsHidingValue.value === 1 ? 1.18 : 1;
    const cutout = Math.max(0, Math.min(resolvedHeight, resolvedHeight - navTranslateY * hideLead));
    return { bottom: cutout };
  }, []);

  useOverlayHeaderActionController({
    visible,
    mode: overlaySheetPolicy.overlayHeaderActionMode,
    sheetY,
    collapseRange: {
      start: middleSnapPoint,
      end: collapsedSnapPoint,
    },
    progress: chromeVisualState.overlayHeaderActionProgress,
  });

  return sheetClipAnimatedStyle;
};
