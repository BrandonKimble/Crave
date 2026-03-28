import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  useMainLaunchCoordinator,
  type StartupCameraSpec,
} from '../navigation/runtime/MainLaunchCoordinator';
import { SPLASH_STUDIO_CONFIG, shouldEnableSplashStudioNativeBlur } from '../splash-studio/config';
import BackdropMapScene from './BackdropMapScene';
import FrostedGridOverlay from './FrostedGridOverlay';
import { FrostedGlassBackground } from './FrostedGlassBackground';

type SplashStudioSceneProps = {
  children?: React.ReactNode;
  cameraSpec?: StartupCameraSpec | null;
  foregroundStyle?: StyleProp<ViewStyle>;
  showFrost?: boolean;
  showGrid?: boolean;
  onReadyChange?: (ready: boolean) => void;
};

const SplashStudioScene: React.FC<SplashStudioSceneProps> = ({
  children,
  cameraSpec,
  foregroundStyle,
  showFrost = true,
  showGrid = true,
  onReadyChange,
}) => {
  const { startupCamera } = useMainLaunchCoordinator();
  const resolvedCameraSpec = cameraSpec ?? startupCamera ?? null;

  return (
    <View style={styles.container}>
      <BackdropMapScene cameraSpec={resolvedCameraSpec} onReadyChange={onReadyChange} />
      {showFrost ? (
        <FrostedGlassBackground
          blurEnabled={shouldEnableSplashStudioNativeBlur}
          intensity={SPLASH_STUDIO_CONFIG.frost.intensity}
          tint={SPLASH_STUDIO_CONFIG.frost.tint}
          tintColor={SPLASH_STUDIO_CONFIG.frost.tintColor}
          tintOpacity={SPLASH_STUDIO_CONFIG.frost.tintOpacity}
          reducedTransparencyFallbackColor="rgba(248, 251, 255, 0.12)"
        />
      ) : null}
      {showGrid ? (
        <FrostedGridOverlay
          minorSize={SPLASH_STUDIO_CONFIG.grid.minorSize}
          majorSize={SPLASH_STUDIO_CONFIG.grid.majorSize}
          minorStroke={SPLASH_STUDIO_CONFIG.grid.minorStroke}
          majorStroke={SPLASH_STUDIO_CONFIG.grid.majorStroke}
        />
      ) : null}
      {children ? (
        <View pointerEvents="box-none" style={[styles.foreground, foregroundStyle]}>
          {children}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SPLASH_STUDIO_CONFIG.backdrop.baseColor,
  },
  foreground: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default React.memo(SplashStudioScene);
