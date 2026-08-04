import React from 'react';
import { Platform, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { BlurView } from '@react-native-community/blur';
import {
  FROSTED_GLASS_DEFAULT_FALLBACK_COLOR,
  FROSTED_GLASS_DEFAULT_INTENSITY,
  FROSTED_GLASS_DEFAULT_TINT,
  resolveFrostedGlassBlurAmount,
  resolveFrostedGlassBlurType,
  type FrostedGlassTint,
} from './frosted-glass-style';

type AppBlurViewProps = {
  intensity?: number;
  tint?: FrostedGlassTint;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  pointerEvents?: ViewProps['pointerEvents'];
  reducedTransparencyFallbackColor?: string;
  enabled?: boolean;
};

const AppBlurView: React.FC<AppBlurViewProps> = ({
  intensity = FROSTED_GLASS_DEFAULT_INTENSITY,
  tint = FROSTED_GLASS_DEFAULT_TINT,
  style,
  children,
  pointerEvents,
  reducedTransparencyFallbackColor,
  enabled = true,
}) => {
  if (!enabled) {
    // F885 (2026-08-03): this used to `return null`, DISCARDING CHILDREN — while the prop
    // reads as "turn off the blur". The blur is the EFFECT; the box is the CONTRACT. It was
    // latent only because the one disabled caller passes no children; the day someone
    // nested content inside a conditionally-blurred surface it would have silently deleted
    // that subtree with no type error and no visual clue beyond "the thing is missing".
    return (
      <View style={style} pointerEvents={pointerEvents}>
        {children}
      </View>
    );
  }

  const iosFallbackProps =
    Platform.OS === 'ios'
      ? {
          reducedTransparencyFallbackColor:
            reducedTransparencyFallbackColor ?? FROSTED_GLASS_DEFAULT_FALLBACK_COLOR,
        }
      : undefined;

  return (
    <BlurView
      blurAmount={resolveFrostedGlassBlurAmount(intensity)}
      blurType={resolveFrostedGlassBlurType(tint)}
      style={style}
      pointerEvents={pointerEvents}
      {...iosFallbackProps}
    >
      {children}
    </BlurView>
  );
};

export default AppBlurView;
