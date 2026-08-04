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

/**
 * F887 (2026-08-03): the tint layer used to be TWO loose optional props (`tintOpacity?`,
 * `tintColor?`) resolved by a nested ternary with THREE fallbacks, one of which
 * (`clampFrostedGlassOpacity(tintOpacity ?? 0)`) was UNREACHABLE — its branch is only
 * entered when `tintColor == null`, which requires `tintOpacity !== undefined`, so the
 * `?? 0` could never apply. An unreachable fallback hides which states are real.
 *
 * `tintOverlay` makes the tint one OBJECT with both fields REQUIRED: absent means "no tint
 * layer", present means "this color at this opacity". The impossible states — an opacity
 * with no color, a color with no opacity — are no longer representable, so there is nothing
 * left to fall back FROM. (`frostedStyles.tint` still carries the default backgroundColor
 * for callers who compose the style directly.)
 */
type FrostedGlassBackgroundProps = {
  intensity?: number;
  tint?: FrostedGlassTint;
  blurStyle?: StyleProp<ViewStyle>;
  tintOverlay?: { color: string; opacity: number };
  reducedTransparencyFallbackColor?: string;
  blurEnabled?: boolean;
};

const FrostedGlassBackground: React.FC<FrostedGlassBackgroundProps> = ({
  intensity = FROSTED_GLASS_DEFAULT_INTENSITY,
  tint = FROSTED_GLASS_DEFAULT_TINT,
  blurStyle,
  tintOverlay,
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
        tintOverlay
          ? {
              backgroundColor: colorWithFrostedGlassOpacity(
                tintOverlay.color,
                clampFrostedGlassOpacity(tintOverlay.opacity)
              ),
            }
          : null,
      ]}
    />
  </>
);

export { frostedStyles, FrostedGlassBackground };
