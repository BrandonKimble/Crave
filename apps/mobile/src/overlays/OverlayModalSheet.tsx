import React from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
  Easing as RNEasing,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OVERLAY_CORNER_RADIUS, OVERLAY_HORIZONTAL_PADDING } from './overlaySheetStyles';
import { OVERLAY_TIMING_CONFIG } from './sheetUtils';
import { useArmedOutsideDismiss } from './useArmedOutsideDismiss';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type OverlayModalSheetProps = {
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

export type OverlayModalSheetHandle = {
  requestClose: () => void;
};

const OverlayModalSheet = React.forwardRef<OverlayModalSheetHandle, OverlayModalSheetProps>(
  (
    {
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
    },
    ref
  ) => {
    const insets = useSafeAreaInsets();
    const [mounted, setMounted] = React.useState(visible);
    const progress = React.useRef(new Animated.Value(visible ? 1 : 0)).current;
    const isExitingRef = React.useRef(false);

    const startExit = React.useCallback(() => {
      if (!mounted || isExitingRef.current) {
        return;
      }
      isExitingRef.current = true;
      progress.stopAnimation();
      Animated.timing(progress, {
        toValue: 0,
        duration: OVERLAY_TIMING_CONFIG.exitDurationMs,
        easing: RNEasing.in(RNEasing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          return;
        }
        isExitingRef.current = false;
        setMounted(false);
        onDismiss?.();
      });
    }, [mounted, onDismiss, progress]);

    const requestClose = React.useCallback(() => {
      // Start the exit animation immediately so it doesn't wait on a heavy parent re-render.
      startExit();
      // Defer notifying the parent until the next frame to keep the close snappy.
      requestAnimationFrame(() => {
        onRequestClose();
      });
    }, [onRequestClose, startExit]);

    React.useImperativeHandle(ref, () => ({ requestClose }), [requestClose]);

    React.useLayoutEffect(() => {
      if (visible) {
        isExitingRef.current = false;
        progress.stopAnimation();
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

      if (!mounted || isExitingRef.current) {
        return;
      }
      startExit();
    }, [mounted, progress, startExit, visible]);

    // Standardized "armed-outside" dismiss: the backdrop only receives touches outside the
    // sheet (the sheet is a sibling painted on top), so a touch there dismisses on first
    // move or on lift — never on touch-down.
    const backdropDismissGesture = useArmedOutsideDismiss({
      enabled: visible,
      onDismiss: requestClose,
    });

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
      <View style={[styles.overlay, { zIndex, elevation: zIndex }]} pointerEvents="box-none">
        <GestureDetector gesture={backdropDismissGesture}>
          <Animated.View
            style={[styles.backdrop, { backgroundColor: backdropColor, opacity: backdropOpacity }]}
            pointerEvents={visible ? 'auto' : 'none'}
            accessible={visible}
            accessibilityRole="button"
            accessibilityLabel="Close sheet"
            onAccessibilityTap={requestClose}
          />
        </GestureDetector>
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
  }
);

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

export default OverlayModalSheet;
