import React from 'react';
import { Platform, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

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
    return null;
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
