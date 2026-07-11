import type { SharedValue } from 'react-native-reanimated';
import type { useAnimatedStyle } from 'react-native-reanimated';

export type AppRouteSceneChromeMotionRuntime = {
  overlayHeaderActionProgress: SharedValue<number>;
  overlayChromeTransitionProgress: SharedValue<number>;
  overlayChromeVisibilityProgress: SharedValue<number>;
  overlayBackdropDimProgress: SharedValue<number>;
  overlayBackdropSheetTopY: SharedValue<number>;
  routeChromeMotionProgress: SharedValue<number>;
  searchBarInputAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  searchChromeOpacity: SharedValue<number>;
  searchChromeContentOpacity: SharedValue<number>;
  searchChromeScale: SharedValue<number>;
  searchChromeTranslateY: SharedValue<number>;
};
