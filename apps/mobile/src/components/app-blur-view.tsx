import React from 'react';
import { Platform, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { BlurView } from '@react-native-community/blur';

type AppBlurViewProps = {
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  pointerEvents?: ViewProps['pointerEvents'];
};

const resolveBlurAmount = (intensity?: number): number => {
  const resolved = intensity ?? 45;
  if (resolved <= 0) {
    return 0;
  }
  const normalized = Math.round(resolved / 3);
  return Math.min(25, Math.max(1, normalized));
};

const resolveBlurType = (tint: 'light' | 'dark' | 'default'): 'light' | 'dark' => {
  if (tint === 'dark') {
    return 'dark';
  }
  return 'light';
};

const AppBlurView: React.FC<AppBlurViewProps> = ({
  intensity,
  tint = 'light',
  style,
  children,
  pointerEvents,
}) => {
  const iosFallbackProps =
    Platform.OS === 'ios'
      ? { reducedTransparencyFallbackColor: 'rgba(248, 251, 255, 0.85)' }
      : undefined;

  return (
    <BlurView
      blurAmount={resolveBlurAmount(intensity)}
      blurType={resolveBlurType(tint)}
      style={style}
      pointerEvents={pointerEvents}
      {...iosFallbackProps}
    >
      {children}
    </BlurView>
  );
};

export default AppBlurView;
