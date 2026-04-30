import React from 'react';

import BottomSheetWithFlashList from './BottomSheetWithFlashList';
import { useOverlaySheetSurfacePropsRuntime } from './useOverlaySheetSurfacePropsRuntime';
import type { RestaurantRouteSheetSnapCallbacksRuntime } from './useRestaurantRouteSheetSnapCallbacksRuntime';
import type { RestaurantRouteSheetStateRuntime } from './useRestaurantRouteSheetStateRuntime';

type UseRestaurantRouteBottomSheetRuntimeArgs = {
  sheetStateRuntime: RestaurantRouteSheetStateRuntime;
  snapCallbacksRuntime: RestaurantRouteSheetSnapCallbacksRuntime;
};

export type RestaurantRouteBottomSheetRuntime = {
  bottomSheetElement: React.ReactNode;
};

export const useRestaurantRouteBottomSheetRuntime = ({
  sheetStateRuntime,
  snapCallbacksRuntime,
}: UseRestaurantRouteBottomSheetRuntimeArgs): RestaurantRouteBottomSheetRuntime => {
  const surfacePropsRuntime = useOverlaySheetSurfacePropsRuntime({
    surfaceProps: sheetStateRuntime.activeShellSpec as Record<string, unknown>,
    visible: sheetStateRuntime.visible,
    snapPoints: sheetStateRuntime.snapPoints,
    initialSnapPoint: sheetStateRuntime.initialSnapPoint,
    sheetY: sheetStateRuntime.sheetY,
    scrollOffset: sheetStateRuntime.scrollOffset,
    momentumFlag: sheetStateRuntime.momentumFlag,
    motionCommandValue:
      sheetStateRuntime.resolvedRuntimeModel.snapController.motionCommand,
    onScrollOffsetChange: sheetStateRuntime.handleScrollOffsetChange,
    onSnapStart: snapCallbacksRuntime.handleSheetSnapStart,
    onSnapChange: snapCallbacksRuntime.handleSheetSnapChange,
    onSnapSettleComplete: snapCallbacksRuntime.handleSnapSettleComplete,
    onDragStateChange: sheetStateRuntime.handleDragStateChange,
    onSettleStateChange: sheetStateRuntime.handleSettleStateChange,
    style: sheetStateRuntime.sheetStyle,
  });
  const bottomSheetElement = React.useMemo(
    () =>
      surfacePropsRuntime.bottomSheetProps ? (
        <BottomSheetWithFlashList
          {...(surfacePropsRuntime.bottomSheetProps as unknown as React.ComponentProps<
            typeof BottomSheetWithFlashList
          >)}
        />
      ) : null,
    [surfacePropsRuntime.bottomSheetProps]
  );

  return React.useMemo(
    () => ({
      bottomSheetElement,
    }),
    [bottomSheetElement]
  );
};
