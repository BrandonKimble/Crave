import React from 'react';
import { PixelRatio, useWindowDimensions } from 'react-native';

import { useAnimatedStyle } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

type UseBottomSheetSharedAnimatedSurfaceRuntimeArgs = {
  scrollOffset: SharedValue<number>;
  scrollTopOffset: SharedValue<number>;
  sheetY: SharedValue<number>;
};

type UseBottomSheetSharedAnimatedSurfaceRuntimeResult = {
  sheetHeightStyle: {
    height: number;
  };
  animatedSheetStyle: ReturnType<typeof useAnimatedStyle>;
  scrollHeaderSyncStyle: ReturnType<typeof useAnimatedStyle>;
};

export const useBottomSheetSharedAnimatedSurfaceRuntime = ({
  scrollOffset,
  scrollTopOffset,
  sheetY,
}: UseBottomSheetSharedAnimatedSurfaceRuntimeArgs): UseBottomSheetSharedAnimatedSurfaceRuntimeResult => {
  const { height: screenHeight } = useWindowDimensions();
  const pixelRatio = PixelRatio.get();

  const sheetHeightStyle = React.useMemo(() => ({ height: screenHeight }), [screenHeight]);

  const animatedSheetStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateY: Math.round(sheetY.value * pixelRatio) / pixelRatio,
        },
      ],
    }),
    [pixelRatio, sheetY]
  );

  const scrollHeaderSyncStyle = useAnimatedStyle(() => {
    const relativeScrollY = scrollOffset.value - scrollTopOffset.value;
    return {
      transform: [{ translateY: -relativeScrollY }],
    };
  }, [scrollOffset, scrollTopOffset]);

  return {
    sheetHeightStyle,
    animatedSheetStyle,
    scrollHeaderSyncStyle,
  };
};
