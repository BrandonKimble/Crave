import { Gesture, type TapGesture } from 'react-native-gesture-handler';
import { withTiming, type SharedValue } from 'react-native-reanimated';

/**
 * THE ONE TOGGLE PRESS LAYER (G3, red-team 2026-08-08) — the UI-thread tap gesture
 * every toggle control rides, stated once. Extracted from SegmentedToggle so
 * FilterChip (previously a JS-thread Pressable with NO pressed state) shares the
 * exact press semantics at the finger:
 *
 * - T1/T2 (plans/toggle-strip-primitive.md): the commit fires on finger-UP no matter
 *   how long the finger was held — `maxDuration` lifted to effectively-infinite (the
 *   RNGH default ~500ms silently discarded a hold-then-release). Movement past the
 *   slop still cancels (maxDistance default), so a drag-away remains an escape hatch;
 *   `shouldCancelWhenOutside(false)` keeps a wander-and-return press alive.
 * - PRESSED STATE runs on the UI thread: `pressedProgress` ramps 0→1 on touch-down
 *   and back on release/cancel, entirely in worklets — a congested JS frame can never
 *   delay the finger's acknowledgment. It is OPTIONAL because the two controls
 *   acknowledge differently by ruling: FilterChip dims through it (its fill swap is a
 *   JS re-render and needs the instant face), while SegmentedToggle's pressed face IS
 *   its traveling highlight (also UI-thread, launched in the same onEnd worklet) — a
 *   second dim there would double-announce the press.
 *
 * `onEndWorklet` runs on the UI thread; commit JS state via runOnJS inside it.
 */

export const TOGGLE_PRESS_IN_MS = 80;
export const TOGGLE_PRESS_OUT_MS = 120;

type TapEndEvent = Parameters<Parameters<TapGesture['onEnd']>[0]>[0];

export const buildTogglePressGesture = ({
  pressedProgress,
  onEndWorklet,
}: {
  /** Optional UI-thread pressed face: 0 = at rest, ramps to 1 while the finger is down. */
  pressedProgress?: SharedValue<number>;
  /** UI-thread worklet; `success` is false when the tap cancelled (drag-away). */
  onEndWorklet: (event: TapEndEvent, success: boolean) => void;
}): TapGesture => {
  let gesture = Gesture.Tap().maxDuration(1e9).shouldCancelWhenOutside(false);
  if (pressedProgress != null) {
    gesture = gesture
      .onBegin(() => {
        'worklet';
        pressedProgress.value = withTiming(1, { duration: TOGGLE_PRESS_IN_MS });
      })
      .onFinalize(() => {
        'worklet';
        pressedProgress.value = withTiming(0, { duration: TOGGLE_PRESS_OUT_MS });
      });
  }
  return gesture.onEnd(onEndWorklet);
};
