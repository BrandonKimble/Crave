import React from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  runOnJS,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  OVERLAY_CORNER_RADIUS,
  OVERLAY_HORIZONTAL_PADDING,
  OVERLAY_NAV_SILHOUETTE_ZINDEX,
} from './overlaySheetStyles';
import { OVERLAY_TIMING_CONFIG } from './sheetUtils';
import { useArmedOutsideDismiss } from './useArmedOutsideDismiss';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// FACT: must sit above OVERLAY_NAV_SILHOUETTE_ZINDEX (120, overlaySheetStyles.ts) — every modal
// sheet renders over the nav silhouette. UNATTRIBUTED: the +10 headroom itself has no recorded
// derivation (F1499).
const OVERLAY_MODAL_SHEET_ZINDEX = OVERLAY_NAV_SILHOUETTE_ZINDEX + 10;

// THE STANDARD MODAL SURFACE (owner spec, 2026-07-08): every modal in the app renders
// through this sheet. Dimmed backdrop kept, no snap points, no grab handle — but
// DYNAMIC: grab it and it follows the finger with rubber-band resistance upward, moves
// freely downward, and dismisses ONLY by swipe down (past a distance or with a flick).
// Anything else springs back. This replaces the centered non-draggable card (the old
// AppModalHost render) and upgrades the gesture-less toggle-strip sheets.

// ─── F976(b): THIS MODAL'S PHYSICS NUMBERS, LABELLED ─────────────────────────────────
// The house convention (see bottomSheetSharedRuntimeUtils): every tuning number is a FACT,
// a FEEL (owner choice — change with the sim open), or UNATTRIBUTED (nobody recorded why;
// re-tune by eye, never "derive").
//
// RECORDED, NOT FIXED: this is the app's THIRD rubber-band curve. The scene-stack sheet has
// two already — the tight fixed-range band (RUBBER_BAND_RANGE_PX = 96 /
// RUBBER_BAND_COEFFICIENT = 0.44) and Apple's native content curve
// (NATIVE_RUBBER_COEFFICIENT = 0.55) — and this one is a different formula again with its own
// ceiling. Unifying them is a VISUAL change on the app's one standard modal, so it is
// owner-gated on a sim look and deliberately NOT done here; what is done is saying out loud
// that three curves exist, so the next person adding a fourth knows they are adding a fourth.

/** FEEL: upward drag resistance — asymptotically approaches this ceiling, never past it.
 *  Deliberately does NOT reuse RUBBER_BAND_RANGE_PX (96): this is a different curve on a
 *  different surface. UNATTRIBUTED as to why 56. */
const RUBBER_BAND_CEILING = 56;
const rubberBand = (distance: number): number => {
  'worklet';
  return (distance * RUBBER_BAND_CEILING) / (distance + RUBBER_BAND_CEILING * 2);
};

/** FEEL: swipe-down dismiss by DISTANCE — drag this far and release, and it goes. */
const DISMISS_DISTANCE = 110;

/** FEEL: ...or by FLICK — this fast downward, and it goes regardless of distance. Shares its
 *  value with PROGRAMMATIC_SNAP_MIN_VELOCITY (900) on the scene-stack sheet, which is a
 *  coincidence of taste rather than a shared derivation. */
const DISMISS_VELOCITY = 900;

/** FACT (the flick arm's distance floor): a flick still has to have MOVED, or a fast
 *  downward tap-and-release would dismiss. 24pt is comfortably above AXIS_LOCK_SLOP_PX (4)
 *  and the tap recogniser's maxDistance (12), so a tap can never satisfy it. */
const DISMISS_FLICK_MIN_DISTANCE = 24;

/** FEEL: the settle spring. damping 26 against stiffness 300 / mass 0.6 is UNDER-damped —
 *  critical would be 2*sqrt(stiffness*mass) = 2*sqrt(180) ≈ 26.8 — so it lands with a barely
 *  perceptible overshoot rather than creeping in. That near-critical relationship is the
 *  reason the three numbers travel together; the exact trio is UNATTRIBUTED. */
const SETTLE_SPRING = {
  damping: 26,
  stiffness: 300,
  mass: 0.6,
} as const;

/** FEEL: the modal never grows into the status bar, and stops this far short of it so the
 *  card reads as a card rather than a full-screen takeover. */
const TOP_BREATHING_ROOM = 48;

type OverlayModalSheetProps = {
  visible: boolean;
  onRequestClose: () => void;
  onDismiss?: () => void;
  children: React.ReactNode;
  /**
   * Opt-in SCROLLABLE capability: content taller than the sheet's max height scrolls
   * inside the content region; the chrome (rounded container, backdrop, dismiss paths)
   * is unchanged. Inside the content the scroll WINS over the swipe-down drag (the pan
   * requires the scroll gesture to fail first) — dismissal stays on backdrop tap, on
   * the non-scrolling chrome, and on `requestClose`. Default off: non-scrollable
   * contents behave exactly as before.
   */
  scrollable?: boolean;
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
      scrollable = false,
      sheetStyle,
      zIndex = OVERLAY_MODAL_SHEET_ZINDEX,
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
      // A stale exit-completion (queued on the JS thread while a rapid reopen already
      // started the enter) must not unmount the fresh presentation or fire a spurious
      // onDismiss — isExitingRef is cleared by the reopen, so it gates staleness.
      if (!isExitingRef.current) {
        return;
      }
      isExitingRef.current = false;
      setMounted(false);
      onDismiss?.();
    }, [onDismiss]);

    const startExit = React.useCallback(() => {
      if (!mounted || isExitingRef.current) {
        return;
      }
      isExitingRef.current = true;
      // The exit may start mid-travel (a drag release folded into progress): the
      // duration scales with the remaining distance so a flick release keeps its
      // momentum instead of stalling into a fresh ease-in over a short remainder.
      const remaining = Math.max(0, Math.min(1, progress.value));
      const duration = Math.max(90, OVERLAY_TIMING_CONFIG.exitDurationMs * remaining);
      const easing = remaining < 1 ? Easing.out(Easing.quad) : Easing.in(Easing.cubic);
      progress.value = withTiming(0, { duration, easing }, (finished) => {
        if (finished) {
          runOnJS(finishExit)();
        }
      });
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
        // Exact fold preserving (1 - p)·SH + dragY: p' = p − dragY/SH. (Clamping to
        // 1 − dragY/SH instead is only correct from p = 1 and snaps the sheet up when
        // released during the enter animation.)
        progress.value = Math.max(0, progress.value - currentDrag / SCREEN_HEIGHT);
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

    // SCROLLABLE content region: the native scroll gesture is registered so the sheet
    // pan can defer to it — inside the content, scroll wins; the pan only activates
    // where the scroll gesture fails (the chrome padding around the scroll region).
    const contentScrollGesture = React.useMemo(() => Gesture.Native(), []);

    // THE GRAB: vertical pan on the sheet body. Downward follows the finger and
    // dismisses past a distance or on a flick; upward rubber-bands. activeOffsetY keeps
    // horizontal gestures (the price slider) untouched; failOffsetX yields to them.
    const sheetPanGesture = React.useMemo(() => {
      const pan = Gesture.Pan()
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
            (event.translationY > DISMISS_FLICK_MIN_DISTANCE && event.velocityY > DISMISS_VELOCITY);
          if (shouldDismiss) {
            runOnJS(requestCloseFromDrag)();
            return;
          }
          dragY.value = withSpring(0, SETTLE_SPRING);
        })
        .onFinalize((_event, success) => {
          'worklet';
          // onEnd only runs when the gesture completes; a mid-drag cancellation
          // (gesture disabled by visible flipping false) skips it and would freeze
          // dragY at its last value — settle it here, the hook that always runs.
          if (!success && dragY.value !== 0) {
            dragY.value = withSpring(0, SETTLE_SPRING);
          }
        });
      // Scroll wins inside the content: the pan may only activate once the scroll
      // gesture has failed (i.e. the touch is on the chrome, not the scroll region).
      return scrollable ? pan.requireExternalGestureToFail(contentScrollGesture) : pan;
      // dragY is a stable shared-value reference.
    }, [contentScrollGesture, requestCloseFromDrag, scrollable, visible]);

    // Keyboard avoidance: the sheet rides above the keyboard (compositor-driven, the
    // same useAnimatedKeyboard pattern as PollCreationPanel) so prompt/text-input
    // content is never covered. Zero when no keyboard — non-input sheets unaffected.
    const keyboard = useAnimatedKeyboard();
    const sheetAnimatedStyle = useAnimatedStyle(() => ({
      transform: [
        { translateY: (1 - progress.value) * SCREEN_HEIGHT + dragY.value - keyboard.height.value },
      ],
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
                maxHeight: SCREEN_HEIGHT - insets.top - TOP_BREATHING_ROOM,
              },
              sheetAnimatedStyle,
              sheetStyle,
            ]}
            // Content stays mounted through the exit slide-out (so it doesn't blank),
            // but must stop receiving taps the moment dismissal starts — a live button
            // during the exit is the double-fire class (e.g. a destructive confirm
            // running twice). The native Modal this replaces fenced both for free.
            pointerEvents={visible ? 'auto' : 'none'}
            accessibilityViewIsModal={visible}
          >
            {scrollable ? (
              <GestureDetector gesture={contentScrollGesture}>
                <ScrollView
                  style={styles.scrollRegion}
                  bounces={false}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {children}
                </ScrollView>
              </GestureDetector>
            ) : (
              children
            )}
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
  scrollRegion: {
    // Size to content (the sheet's maxHeight is the cap that makes it scroll) instead
    // of greedily filling — short scrollable contents keep the sheet content-height.
    flexGrow: 0,
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: OVERLAY_CORNER_RADIUS,
    borderTopRightRadius: OVERLAY_CORNER_RADIUS,
  },
});

export default OverlayModalSheet;
