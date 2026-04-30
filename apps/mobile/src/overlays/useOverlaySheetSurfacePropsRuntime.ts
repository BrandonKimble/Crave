import React from 'react';

import type { BottomSheetWithFlashListBaseProps } from './bottomSheetWithFlashListContract';
import { overlaySheetStyles } from './overlaySheetStyles';
import type { BottomSheetRuntimeModel } from './useBottomSheetRuntime';

type UseOverlaySheetSurfacePropsRuntimeArgs<TSurfaceProps extends object> = {
  surfaceProps: TSurfaceProps;
  visible: boolean;
  snapPoints: BottomSheetWithFlashListBaseProps<unknown>['snapPoints'];
  initialSnapPoint: BottomSheetWithFlashListBaseProps<unknown>['initialSnapPoint'];
  sheetY: BottomSheetRuntimeModel['presentationState']['sheetY'];
  scrollOffset: BottomSheetRuntimeModel['presentationState']['scrollOffset'];
  momentumFlag: BottomSheetRuntimeModel['presentationState']['momentumFlag'];
  motionCommandValue: BottomSheetRuntimeModel['snapController']['motionCommand'];
  onScrollOffsetChange: BottomSheetWithFlashListBaseProps<unknown>['onScrollOffsetChange'];
  onSnapStart: BottomSheetWithFlashListBaseProps<unknown>['onSnapStart'];
  onSnapChange: BottomSheetWithFlashListBaseProps<unknown>['onSnapChange'];
  onSnapSettleComplete: BottomSheetWithFlashListBaseProps<unknown>['onSnapSettleComplete'];
  onDragStateChange: BottomSheetWithFlashListBaseProps<unknown>['onDragStateChange'];
  onSettleStateChange: BottomSheetWithFlashListBaseProps<unknown>['onSettleStateChange'];
  style: BottomSheetWithFlashListBaseProps<unknown>['style'];
};

export type OverlaySheetSurfacePropsRuntime<TSurfaceProps extends object> = {
  bottomSheetProps: TSurfaceProps & BottomSheetWithFlashListBaseProps<unknown>;
};

export const useOverlaySheetSurfacePropsRuntime = <TSurfaceProps extends object>({
  surfaceProps,
  visible,
  snapPoints,
  initialSnapPoint,
  sheetY,
  scrollOffset,
  momentumFlag,
  motionCommandValue,
  onScrollOffsetChange,
  onSnapStart,
  onSnapChange,
  onSnapSettleComplete,
  onDragStateChange,
  onSettleStateChange,
  style,
}: UseOverlaySheetSurfacePropsRuntimeArgs<TSurfaceProps>): OverlaySheetSurfacePropsRuntime<TSurfaceProps> => {
  const bottomSheetProps = React.useMemo<TSurfaceProps & BottomSheetWithFlashListBaseProps<unknown>>(
    () => ({
      ...surfaceProps,
      visible,
      snapPoints,
      initialSnapPoint,
      preservePositionOnSnapPointsChange: true,
      sheetYValue: sheetY,
      scrollOffsetValue: scrollOffset,
      momentumFlag,
      motionCommandValue,
      onScrollOffsetChange,
      onSnapStart,
      onSnapChange,
      onSnapSettleComplete,
      onDragStateChange,
      onSettleStateChange,
      style: style ?? overlaySheetStyles.container,
    }),
    [
      initialSnapPoint,
      momentumFlag,
      motionCommandValue,
      onDragStateChange,
      onScrollOffsetChange,
      onSettleStateChange,
      onSnapChange,
      onSnapSettleComplete,
      onSnapStart,
      scrollOffset,
      sheetY,
      snapPoints,
      style,
      surfaceProps,
      visible,
    ]
  );

  return React.useMemo(
    () => ({
      bottomSheetProps,
    }),
    [bottomSheetProps]
  );
};
