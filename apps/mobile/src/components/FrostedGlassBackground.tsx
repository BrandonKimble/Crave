import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import AppBlurView from './app-blur-view';

const frostedStyles = StyleSheet.create({
  blur: StyleSheet.absoluteFillObject,
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248, 251, 255, 0.30)',
  },
});

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const colorWithOpacity = (color: string, opacity: number): string => {
  const normalizedOpacity = clamp01(opacity);
  const normalized = color.trim();

  if (normalized.startsWith('#')) {
    const raw = normalized.slice(1);
    const expanded =
      raw.length === 3
        ? raw
            .split('')
            .map((part) => part + part)
            .join('')
        : raw;
    if (/^[0-9a-fA-F]{6}$/.test(expanded)) {
      const r = parseInt(expanded.slice(0, 2), 16);
      const g = parseInt(expanded.slice(2, 4), 16);
      const b = parseInt(expanded.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${normalizedOpacity})`;
    }
  }

  if (normalized.startsWith('rgb(')) {
    const body = normalized.slice(4, -1);
    return `rgba(${body}, ${normalizedOpacity})`;
  }

  if (normalized.startsWith('rgba(')) {
    return normalized.replace(/rgba\((.+),\s*[\d.]+\)$/, `rgba($1, ${normalizedOpacity})`);
  }

  return normalized;
};

type FrostedGlassBackgroundProps = {
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  blurStyle?: StyleProp<ViewStyle>;
  tintOpacity?: number;
  tintColor?: string;
  reducedTransparencyFallbackColor?: string;
  blurEnabled?: boolean;
};

const FrostedGlassBackground: React.FC<FrostedGlassBackgroundProps> = ({
  intensity = 45,
  tint = 'light',
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
                  ? colorWithOpacity(tintColor, tintOpacity ?? 1)
                  : `rgba(248, 251, 255, ${clamp01(tintOpacity ?? 0)})`,
            }
          : null,
      ]}
    />
  </>
);

export { frostedStyles, FrostedGlassBackground };
