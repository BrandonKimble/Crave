import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import AppBlurView from './app-blur-view';
import {
  FROSTED_GLASS_DEFAULT_INTENSITY,
  FROSTED_GLASS_DEFAULT_TINT,
  FROSTED_GLASS_DEFAULT_TINT_COLOR,
  clampFrostedGlassOpacity,
  colorWithFrostedGlassOpacity,
  type FrostedGlassTint,
} from './frosted-glass-style';

const frostedStyles = StyleSheet.create({
  blur: StyleSheet.absoluteFillObject,
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: FROSTED_GLASS_DEFAULT_TINT_COLOR,
  },
});

type FrostedGlassBackgroundProps = {
  intensity?: number;
  tint?: FrostedGlassTint;
  blurStyle?: StyleProp<ViewStyle>;
  tintOpacity?: number;
  tintColor?: string;
  reducedTransparencyFallbackColor?: string;
  blurEnabled?: boolean;
};

const FrostedGlassBackground: React.FC<FrostedGlassBackgroundProps> = ({
  intensity = FROSTED_GLASS_DEFAULT_INTENSITY,
  tint = FROSTED_GLASS_DEFAULT_TINT,
  blurStyle,
  tintOpacity,
  tintColor,
  reducedTransparencyFallbackColor,
  blurEnabled = true,
}) => (
  <>
    <AppBlurView
      enabled={blurEnabled}
      pointerEvents="none"
      intensity={intensity}
      tint={tint}
      style={[frostedStyles.blur, blurStyle]}
      reducedTransparencyFallbackColor={reducedTransparencyFallbackColor}
    />
    <View
      pointerEvents="none"
      style={[
        frostedStyles.tint,
        tintOpacity !== undefined || tintColor
          ? {
              backgroundColor:
                tintColor != null
                  ? colorWithFrostedGlassOpacity(tintColor, tintOpacity ?? 1)
                  : colorWithFrostedGlassOpacity(
                      FROSTED_GLASS_DEFAULT_TINT_COLOR,
                      clampFrostedGlassOpacity(tintOpacity ?? 0)
                    ),
            }
          : null,
      ]}
    />
  </>
);

export { frostedStyles, FrostedGlassBackground };
