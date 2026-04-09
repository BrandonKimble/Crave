import React from 'react';
import { useWindowDimensions } from 'react-native';

import type { BottomSheetNativeHostProps } from './BottomSheetNativeHost';
import type { BottomSheetHostNativePropsRuntimeArgs } from './bottomSheetHostRuntimeContract';

export const useBottomSheetNativeHostPropsRuntime = ({
  hostKey,
  visible,
  snapPoints,
  initialSnapPoint,
  preservePositionOnSnapPointsChange,
  preventSwipeDismiss,
  interactionEnabled,
  animateOnMount,
  dismissThreshold,
  style,
  hostEventProps,
  sheetCommand,
}: BottomSheetHostNativePropsRuntimeArgs): Omit<BottomSheetNativeHostProps, 'children'> => {
  const { height: screenHeight } = useWindowDimensions();
  const sheetHeightStyle = React.useMemo(() => ({ height: screenHeight }), [screenHeight]);

  return React.useMemo(
    () => ({
      hostKey,
      visible,
      snapPoints,
      initialSnapPoint,
      preservePositionOnSnapPointsChange,
      preventSwipeDismiss,
      interactionEnabled,
      animateOnMount,
      dismissThreshold,
      sheetCommand,
      ...hostEventProps,
      style: [style, sheetHeightStyle],
    }),
    [
      animateOnMount,
      dismissThreshold,
      hostEventProps,
      hostKey,
      initialSnapPoint,
      interactionEnabled,
      preservePositionOnSnapPointsChange,
      preventSwipeDismiss,
      sheetCommand,
      sheetHeightStyle,
      snapPoints,
      style,
      visible,
    ]
  );
};
