import {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

const DEFAULT_DIVIDER_FADE_DISTANCE = 24;

const useScrollDividerStyle = (
  scrollOffset: SharedValue<number>,
  fadeDistance: number = DEFAULT_DIVIDER_FADE_DISTANCE
) =>
  useAnimatedStyle(
    () => ({
      opacity: interpolate(scrollOffset.value, [0, fadeDistance], [0, 1], Extrapolation.CLAMP),
    }),
    [fadeDistance, scrollOffset]
  );

export default useScrollDividerStyle;
