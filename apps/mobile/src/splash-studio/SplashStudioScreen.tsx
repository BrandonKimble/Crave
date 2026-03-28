import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import SplashStudioScene from '../components/SplashStudioScene';
import { logger } from '../utils';
import {
  SPLASH_STUDIO_CAMERA_SPEC,
  shouldShowSplashStudioFrost,
  shouldShowSplashStudioGrid,
  shouldShowSplashStudioLabel,
} from './config';

const READY_BADGE_HIDE_DELAY_MS = 1100;

const SplashStudioScreen: React.FC = () => {
  const [isReady, setIsReady] = React.useState(false);
  const [showLabel, setShowLabel] = React.useState(shouldShowSplashStudioLabel);
  const didLogCaptureWindowRef = React.useRef(false);

  React.useEffect(() => {
    if (!shouldShowSplashStudioLabel) {
      setShowLabel(false);
      return;
    }
    if (!isReady) {
      setShowLabel(true);
      return;
    }
    const timer = setTimeout(() => {
      setShowLabel(false);
    }, READY_BADGE_HIDE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isReady]);

  React.useEffect(() => {
    if (!isReady || showLabel || didLogCaptureWindowRef.current) {
      return;
    }
    didLogCaptureWindowRef.current = true;
    logger.info('[SPLASH-STUDIO] capture_window_open', {
      camera: SPLASH_STUDIO_CAMERA_SPEC,
    });
  }, [isReady, showLabel]);

  const handleReadyChange = React.useCallback((ready: boolean) => {
    setIsReady(ready);
    if (!ready) {
      didLogCaptureWindowRef.current = false;
    }
  }, []);

  return (
    <>
      <StatusBar hidden style="auto" />
      <SplashStudioScene
        cameraSpec={SPLASH_STUDIO_CAMERA_SPEC}
        showFrost={shouldShowSplashStudioFrost}
        showGrid={shouldShowSplashStudioGrid}
        onReadyChange={handleReadyChange}
      >
        {showLabel ? (
          <View pointerEvents="none" style={styles.labelShell}>
            <View style={styles.labelPill}>
              <Text style={styles.labelText}>
                {isReady ? 'Ready to Capture' : 'Preparing Splash Capture'}
              </Text>
            </View>
          </View>
        ) : null}
      </SplashStudioScene>
    </>
  );
};

const styles = StyleSheet.create({
  labelShell: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingTop: 56,
    paddingHorizontal: 20,
  },
  labelPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  labelText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default React.memo(SplashStudioScreen);
