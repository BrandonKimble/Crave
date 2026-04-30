import React from 'react';

import { useAnimatedStyle } from 'react-native-reanimated';

import type { RestaurantRouteLayerPresentationModel } from './restaurantRouteHostContract';
import { useOverlayHeaderActionController } from './useOverlayHeaderActionController';
import type { RestaurantRouteSheetStateRuntime } from './useRestaurantRouteSheetStateRuntime';

type UseRestaurantRouteSheetChromeRuntimeArgs = {
  presentationModel: RestaurantRouteLayerPresentationModel;
  sheetStateRuntime: RestaurantRouteSheetStateRuntime;
};

export type RestaurantRouteSheetChromeRuntime = {
  sheetClipAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
};

export const useRestaurantRouteSheetChromeRuntime = ({
  presentationModel,
  sheetStateRuntime,
}: UseRestaurantRouteSheetChromeRuntimeArgs): RestaurantRouteSheetChromeRuntime => {
  const {
    visible,
    headerActionMode,
    headerActionProgress,
    navBarHeight,
    applyNavBarCutout,
    navBarCutoutProgress,
    navBarHiddenTranslateY,
    navBarCutoutIsHiding,
  } = presentationModel;
  const {
    resolvedRuntimeModel,
    middleSnapPoint,
    collapsedSnapPoint,
  } = sheetStateRuntime;
  const resolvedNavBarHeight = Math.max(navBarHeight, 0);

  const sheetClipAnimatedStyle = useAnimatedStyle(() => {
    if (!applyNavBarCutout) {
      return { bottom: 0 };
    }
    const progress = navBarCutoutProgress
      ? Math.max(0, Math.min(1, navBarCutoutProgress.value))
      : 1;
    const navTranslateY = Math.max(0, (1 - progress) * Math.max(0, navBarHiddenTranslateY));
    const hideLead = navBarCutoutIsHiding ? 1.18 : 1;
    const cutout = Math.max(
      0,
      Math.min(resolvedNavBarHeight, resolvedNavBarHeight - navTranslateY * hideLead)
    );
    return { bottom: cutout };
  }, [
    applyNavBarCutout,
    navBarCutoutIsHiding,
    navBarCutoutProgress,
    navBarHiddenTranslateY,
    resolvedNavBarHeight,
  ]);

  useOverlayHeaderActionController({
    visible,
    mode: headerActionMode,
    sheetY: resolvedRuntimeModel.presentationState.sheetY,
    collapseRange: {
      start: middleSnapPoint,
      end: collapsedSnapPoint,
    },
    progress: headerActionProgress,
  });

  return React.useMemo(
    () => ({
      sheetClipAnimatedStyle,
    }),
    [sheetClipAnimatedStyle]
  );
};
