import React from 'react';
import { BlurView } from 'expo-blur';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

const frostedStyles = StyleSheet.create({
  blur: StyleSheet.absoluteFillObject,
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  highlight: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: 120,
    left: -40,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    opacity: 0.2,
    transform: [{ rotate: '35deg' }],
  },
});

type FrostedGlassBackgroundProps = {
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  blurStyle?: StyleProp<ViewStyle>;
};

const FrostedGlassBackground: React.FC<FrostedGlassBackgroundProps> = ({
  intensity = 45,
  tint = 'light',
  blurStyle,
}) => (
  <>
    <BlurView
      pointerEvents="none"
      intensity={intensity}
      tint={tint}
      style={[frostedStyles.blur, blurStyle]}
    />
    <View pointerEvents="none" style={frostedStyles.tint} />
    <View pointerEvents="none" style={frostedStyles.highlight} />
  </>
);

export { frostedStyles, FrostedGlassBackground };
