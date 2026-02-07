import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { WifiOff, TriangleAlert } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './ui/Text';
import { useSystemStatusStore } from '../store/systemStatusStore';
import { FONT_SIZES, LINE_HEIGHTS } from '../constants/typography';
import { OVERLAY_CORNER_RADIUS } from '../overlays/overlaySheetStyles';

const CONTENT_HEIGHT = 20;

const DEFAULT_SERVICE_MESSAGE = 'Service temporarily unavailable.';
const OFFLINE_MESSAGE = 'Your device is offline.';
const BANNER_BACKGROUND = '#000000';
const BANNER_CONCAVE_RADIUS = OVERLAY_CORNER_RADIUS;
const BANNER_SIDE_EXTENSION = 8;
const CONTENT_VERTICAL_OFFSET = -8;

const SystemStatusBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isOffline = useSystemStatusStore((state) => state.isOffline);
  const serviceIssue = useSystemStatusStore((state) => state.serviceIssue);

  const banner = React.useMemo(() => {
    if (isOffline) {
      return {
        kind: 'offline' as const,
        message: OFFLINE_MESSAGE,
      };
    }
    if (serviceIssue) {
      return {
        kind: 'service' as const,
        message: DEFAULT_SERVICE_MESSAGE,
      };
    }
    return null;
  }, [isOffline, serviceIssue]);

  const isVisible = Boolean(banner);
  const progress = useSharedValue(isVisible ? 1 : 0);

  React.useEffect(() => {
    progress.value = withTiming(isVisible ? 1 : 0, {
      duration: 220,
      easing: isVisible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    });
  }, [isVisible, progress]);

  const baseHeight = insets.top + CONTENT_HEIGHT;
  const fullHeight = baseHeight + BANNER_CONCAVE_RADIUS + BANNER_SIDE_EXTENSION;
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -fullHeight * (1 - progress.value) }],
  }));
  const shapePath = React.useMemo(() => {
    const width = Math.max(windowWidth, BANNER_CONCAVE_RADIUS * 2);
    const radius = Math.min(BANNER_CONCAVE_RADIUS, width / 2);
    const cutoutTop = baseHeight;
    const cutoutBottom = fullHeight;
    const cutoutStartY = cutoutTop + radius;
    return [
      'M0 0',
      `H${width}`,
      `V${fullHeight}`,
      `L${width} ${cutoutStartY}`,
      `Q${width} ${cutoutTop} ${width - radius} ${cutoutTop}`,
      `H${radius}`,
      `Q0 ${cutoutTop} 0 ${cutoutStartY}`,
      `L0 ${cutoutBottom}`,
      'Z',
    ].join(' ');
  }, [baseHeight, fullHeight, windowWidth]);

  const icon =
    banner?.kind === 'offline' ? (
      <WifiOff size={16} color="#ef4444" strokeWidth={2.2} />
    ) : (
      <TriangleAlert size={16} color="#ef4444" strokeWidth={2.2} />
    );
  const message = banner?.message ?? OFFLINE_MESSAGE;

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[styles.container, { height: fullHeight }, containerAnimatedStyle]}
    >
      <Svg
        pointerEvents="none"
        width={windowWidth}
        height={fullHeight}
        style={styles.backgroundShape}
      >
        <Path d={shapePath} fill={BANNER_BACKGROUND} />
      </Svg>
      <View style={[styles.safeAreaSpacer, { height: insets.top }]} />
      <View style={[styles.contentRow, !banner && styles.contentRowHidden]}>
        <View style={styles.icon}>{icon}</View>
        <Text weight="regular" style={styles.messageText}>
          {message}
        </Text>
      </View>
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
  backgroundShape: {
    ...StyleSheet.absoluteFillObject,
  },
  contentRow: {
    height: CONTENT_HEIGHT,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transform: [{ translateY: CONTENT_VERTICAL_OFFSET }],
  },
  contentRowHidden: {
    opacity: 0,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageText: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    color: '#f8fafc',
  },
});

export default SystemStatusBanner;
