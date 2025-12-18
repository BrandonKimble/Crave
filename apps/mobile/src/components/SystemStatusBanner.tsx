import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { WifiOff, TriangleAlert } from 'lucide-react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './ui/Text';
import { useSystemStatusStore } from '../store/systemStatusStore';
import { OVERLAY_CORNER_RADIUS } from '../overlays/overlaySheetStyles';
import MaskedHoleOverlay from './MaskedHoleOverlay';

const CONTENT_HEIGHT = 32;

const DEFAULT_SERVICE_MESSAGE = 'Service temporarily unavailable.';
const BANNER_BACKGROUND = '#0b0b0f';

const SystemStatusBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isOffline = useSystemStatusStore((state) => state.isOffline);
  const serviceIssue = useSystemStatusStore((state) => state.serviceIssue);

  const banner = React.useMemo(() => {
    if (isOffline) {
      return {
        kind: 'offline' as const,
        message: 'Your device is offline.',
      };
    }
    if (serviceIssue) {
      return {
        kind: 'service' as const,
        message: serviceIssue.message || DEFAULT_SERVICE_MESSAGE,
      };
    }
    return null;
  }, [isOffline, serviceIssue]);

  const isVisible = Boolean(banner);
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withTiming(isVisible ? 1 : 0, {
      duration: 220,
      easing: isVisible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    });
  }, [isVisible, progress]);

  const fullHeight = insets.top + CONTENT_HEIGHT;
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    height: fullHeight * progress.value,
    opacity: progress.value,
  }));

  const cornerHoles = React.useMemo(() => {
    if (!isVisible || windowWidth <= 0) {
      return [];
    }
    const radius = OVERLAY_CORNER_RADIUS;
    const size = radius * 2;
    const y = fullHeight - radius;
    return [
      { x: -radius, y, width: size, height: size, borderRadius: radius },
      { x: windowWidth - radius, y, width: size, height: size, borderRadius: radius },
    ];
  }, [fullHeight, isVisible, windowWidth]);

  const icon =
    banner?.kind === 'offline' ? (
      <WifiOff size={16} color="#ef4444" strokeWidth={2.2} />
    ) : (
      <TriangleAlert size={16} color="#ef4444" strokeWidth={2.2} />
    );

  return (
    <Reanimated.View
      pointerEvents={isVisible ? 'auto' : 'none'}
      style={[styles.container, containerAnimatedStyle]}
    >
      {cornerHoles.length ? (
        <MaskedHoleOverlay holes={cornerHoles} backgroundColor={BANNER_BACKGROUND} />
      ) : (
        <View style={styles.backgroundFill} />
      )}
      <View style={[styles.safeAreaSpacer, { height: insets.top }]} />
      {banner ? (
        <View style={styles.contentRow}>
          <View style={styles.icon}>{icon}</View>
          <Text weight="regular" style={styles.messageText}>
            {banner.message}
          </Text>
        </View>
      ) : null}
    </Reanimated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 20,
  },
  safeAreaSpacer: {
    width: '100%',
  },
  backgroundFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BANNER_BACKGROUND,
  },
  contentRow: {
    height: CONTENT_HEIGHT,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageText: {
    fontSize: 12,
    color: '#f8fafc',
  },
});

export default SystemStatusBanner;
