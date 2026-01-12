import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import AppBlurView from './app-blur-view';

const frostedStyles = StyleSheet.create({
  blur: StyleSheet.absoluteFillObject,
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248, 251, 255, 0.35)',
  },
});

type FrostedGlassBackgroundProps = {
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  blurStyle?: StyleProp<ViewStyle>;
  tintOpacity?: number;
  tintColor?: string;
};

const FrostedGlassBackground: React.FC<FrostedGlassBackgroundProps> = ({
  intensity = 45,
  tint = 'light',
  blurStyle,
  tintOpacity,
  tintColor,
}) => (
  <>
    <AppBlurView
      pointerEvents="none"
      intensity={intensity}
      tint={tint}
      style={[frostedStyles.blur, blurStyle]}
    />
    <View
      pointerEvents="none"
      style={[
        frostedStyles.tint,
        tintOpacity !== undefined || tintColor
          ? {
              backgroundColor:
                tintColor ?? `rgba(248, 251, 255, ${Math.min(1, Math.max(0, tintOpacity ?? 0))})`,
            }
          : null,
      ]}
    />
  </>
);

export { frostedStyles, FrostedGlassBackground };
