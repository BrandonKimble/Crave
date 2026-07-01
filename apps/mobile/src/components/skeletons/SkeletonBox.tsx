import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors as themeColors } from '../../constants/theme';

/**
 * The legacy atomic placeholder: a rounded gray box whose opacity pulses while content loads.
 * The app's loading skeletons are now the cutout-shimmer surface (SceneLoadingSurface →
 * CutoutSkeletonSurface), so this is kept ONLY for the ProfilePanel identity skeleton
 * (avatar/name/stat bars), which has no cutout preset yet.
 */

export const SKELETON_PULSE_DURATION_MS = 700;
const SKELETON_PULSE_MIN_OPACITY = 0.4;
const SKELETON_PULSE_MAX_OPACITY = 0.85;

export type SkeletonBoxProps = {
  width?: ViewStyle['width'];
  height?: number;
  borderRadius?: number;
  style?: ViewStyle | ViewStyle[];
};

export const SkeletonBox: React.FC<SkeletonBoxProps> = ({
  width = '100%',
  height = 12,
  borderRadius = 6,
  style,
}) => {
  const pulse = useSharedValue(SKELETON_PULSE_MAX_OPACITY);

  React.useEffect(() => {
    pulse.value = withRepeat(
      withTiming(SKELETON_PULSE_MIN_OPACITY, {
        duration: SKELETON_PULSE_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Reanimated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.box, { width, height, borderRadius }, style, animatedStyle]}
    />
  );
};

const styles = StyleSheet.create({
  box: {
    backgroundColor: themeColors.border,
  },
});

export default SkeletonBox;
