import React from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
  Easing as RNEasing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OVERLAY_CORNER_RADIUS, OVERLAY_HORIZONTAL_PADDING } from './overlaySheetStyles';
import { OVERLAY_TIMING_CONFIG } from './sheetUtils';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type SecondaryBottomSheetProps = {
  visible: boolean;
  onRequestClose: () => void;
  onDismiss?: () => void;
  children: React.ReactNode;
  sheetStyle?: StyleProp<ViewStyle>;
  zIndex?: number;
  maxBackdropOpacity?: number;
  paddingHorizontal?: number;
  paddingTop?: number;
  minBottomPadding?: number;
  backdropColor?: string;
};

const SecondaryBottomSheet: React.FC<SecondaryBottomSheetProps> = ({
  visible,
  onRequestClose,
  onDismiss,
  children,
  sheetStyle,
  zIndex = 130,
  maxBackdropOpacity = 0.2,
  paddingHorizontal = OVERLAY_HORIZONTAL_PADDING,
  paddingTop = 8,
  minBottomPadding = 12,
  backdropColor = '#0f172a',
}) => {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = React.useState(visible);
  const progress = React.useRef(new Animated.Value(visible ? 1 : 0)).current;

  React.useEffect(() => {
    progress.stopAnimation();
    if (visible) {
      setMounted(true);
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: OVERLAY_TIMING_CONFIG.enterDurationMs,
        easing: RNEasing.out(RNEasing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!mounted) {
      return;
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: OVERLAY_TIMING_CONFIG.exitDurationMs,
      easing: RNEasing.in(RNEasing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }
      setMounted(false);
      onDismiss?.();
    });
  }, [mounted, onDismiss, progress, visible]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
    extrapolate: 'clamp',
  });
  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, maxBackdropOpacity],
  });

  if (!mounted) {
    return null;
  }

  return (
    <View style={[styles.overlay, { zIndex }]} pointerEvents="box-none">
      <Animated.View
        style={[styles.backdrop, { backgroundColor: backdropColor, opacity: backdropOpacity }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onRequestClose}
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingHorizontal,
            paddingTop,
            paddingBottom: Math.max(insets.bottom, minBottomPadding),
            transform: [{ translateY }],
          },
          sheetStyle,
        ]}
        pointerEvents="auto"
      >
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: OVERLAY_CORNER_RADIUS,
    borderTopRightRadius: OVERLAY_CORNER_RADIUS,
  },
});

export default SecondaryBottomSheet;
