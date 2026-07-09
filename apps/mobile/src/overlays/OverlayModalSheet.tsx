import React from 'react';
import { Dimensions, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OVERLAY_CORNER_RADIUS, OVERLAY_HORIZONTAL_PADDING } from './overlaySheetStyles';
import { OVERLAY_TIMING_CONFIG } from './sheetUtils';
import { useArmedOutsideDismiss } from './useArmedOutsideDismiss';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// THE STANDARD MODAL SURFACE (owner spec, 2026-07-08): every modal in the app renders
// through this sheet. Dimmed backdrop kept, no snap points, no grab handle — but
// DYNAMIC: grab it and it follows the finger with rubber-band resistance upward, moves
// freely downward, and dismisses ONLY by swipe down (past a distance or with a flick).
// Anything else springs back. This replaces the centered non-draggable card (the old
// AppModalHost render) and upgrades the gesture-less toggle-strip sheets.

/** Upward drag resistance: asymptotically approaches the ceiling, never past it. */
const RUBBER_BAND_CEILING = 56;
const rubberBand = (distance: number): number => {
  'worklet';
  return (distance * RUBBER_BAND_CEILING) / (distance + RUBBER_BAND_CEILING * 2);
};

/** Swipe-down dismiss thresholds: distance OR a flick. */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;

const SETTLE_SPRING = {
  damping: 26,
  stiffness: 300,
  mass: 0.6,
} as const;

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
    // progress: 0 = off-screen (bottom), 1 = presented — drives enter/exit and the dim.
    // dragY rides ON TOP of the presented position while the finger owns the sheet.
    const progress = useSharedValue(visible ? 1 : 0);
    const dragY = useSharedValue(0);
    const isExitingRef = React.useRef(false);

    const finishExit = React.useCallback(() => {
      isExitingRef.current = false;
      setMounted(false);
      onDismiss?.();
    }, [onDismiss]);

    const startExit = React.useCallback(() => {
      if (!mounted || isExitingRef.current) {
        return;
      }
      isExitingRef.current = true;
      progress.value = withTiming(
        0,
        { duration: OVERLAY_TIMING_CONFIG.exitDurationMs, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) {
            runOnJS(finishExit)();
          }
        }
      );
    }, [finishExit, mounted, progress]);

    const requestClose = React.useCallback(() => {
      // Start the exit animation immediately so it doesn't wait on a heavy parent re-render.
      startExit();
      // Defer notifying the parent until the next frame to keep the close snappy.
      requestAnimationFrame(() => {
        onRequestClose();
      });
    }, [onRequestClose, startExit]);

    // Swipe-down dismiss handoff: fold the current drag offset into the progress axis so
    // the exit animation continues from exactly where the finger let go (no snap flash).
    const requestCloseFromDrag = React.useCallback(() => {
      const currentDrag = dragY.value;
      if (currentDrag > 0) {
        progress.value = Math.min(progress.value, Math.max(0, 1 - currentDrag / SCREEN_HEIGHT));
        dragY.value = 0;
      }
      requestClose();
    }, [dragY, progress, requestClose]);

    React.useImperativeHandle(ref, () => ({ requestClose }), [requestClose]);

    React.useLayoutEffect(() => {
      if (visible) {
        isExitingRef.current = false;
        setMounted(true);
        dragY.value = 0;
        progress.value = 0;
        progress.value = withTiming(1, {
          duration: OVERLAY_TIMING_CONFIG.enterDurationMs,
          easing: Easing.out(Easing.cubic),
        });
        return;
      }
      if (!mounted || isExitingRef.current) {
        return;
      }
      startExit();
      // dragY/progress are stable shared-value references.
    }, [mounted, startExit, visible]);

    // Standardized "armed-outside" dismiss: the backdrop only receives touches outside the
    // sheet (the sheet is a sibling painted on top), so a touch there dismisses on first
    // move or on lift — never on touch-down.
    const backdropDismissGesture = useArmedOutsideDismiss({
      enabled: visible,
      onDismiss: requestClose,
    });

    // THE GRAB: vertical pan on the sheet body. Downward follows the finger and
    // dismisses past a distance or on a flick; upward rubber-bands. activeOffsetY keeps
    // horizontal gestures (the price slider) untouched; failOffsetX yields to them.
    const sheetPanGesture = React.useMemo(
      () =>
        Gesture.Pan()
          .enabled(visible)
          .activeOffsetY([-12, 12])
          .failOffsetX([-16, 16])
          .onUpdate((event) => {
            'worklet';
            dragY.value =
              event.translationY >= 0 ? event.translationY : -rubberBand(-event.translationY);
          })
          .onEnd((event) => {
            'worklet';
            const shouldDismiss =
              event.translationY > DISMISS_DISTANCE ||
              (event.translationY > 24 && event.velocityY > DISMISS_VELOCITY);
            if (shouldDismiss) {
              runOnJS(requestCloseFromDrag)();
              return;
            }
            dragY.value = withSpring(0, SETTLE_SPRING);
          }),
      // dragY is a stable shared-value reference.
      [requestCloseFromDrag, visible]
    );

    const sheetAnimatedStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: (1 - progress.value) * SCREEN_HEIGHT + dragY.value }],
    }));
    const backdropAnimatedStyle = useAnimatedStyle(() => {
      // The dim follows the sheet: eases off as the sheet is dragged toward dismissal.
      const dragFade = dragY.value > 0 ? Math.max(0, 1 - dragY.value / (SCREEN_HEIGHT * 0.6)) : 1;
      return { opacity: progress.value * maxBackdropOpacity * dragFade };
    });

    if (!mounted) {
      return null;
    }

    return (
      <View style={[styles.overlay, { zIndex, elevation: zIndex }]} pointerEvents="box-none">
        <GestureDetector gesture={backdropDismissGesture}>
          <Reanimated.View
            style={[styles.backdrop, { backgroundColor: backdropColor }, backdropAnimatedStyle]}
            pointerEvents={visible ? 'auto' : 'none'}
            accessible={visible}
            accessibilityRole="button"
            accessibilityLabel="Close sheet"
            onAccessibilityTap={requestClose}
          />
        </GestureDetector>
        <GestureDetector gesture={sheetPanGesture}>
          <Reanimated.View
            style={[
              styles.sheet,
              {
                paddingHorizontal,
                paddingTop,
                paddingBottom: Math.max(insets.bottom, minBottomPadding),
              },
              sheetAnimatedStyle,
              sheetStyle,
            ]}
            pointerEvents="auto"
          >
            {children}
          </Reanimated.View>
        </GestureDetector>
      </View>
    );
  }
);

OverlayModalSheet.displayName = 'OverlayModalSheet';

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
