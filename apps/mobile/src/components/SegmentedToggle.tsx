import React from 'react';
import { type LayoutChangeEvent, type LayoutRectangle, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from './ui/Text';

/**
 * N-position sliding-pill segmented toggle — THE house toggle primitive, a
 * self-contained, reusable mirror of the search restaurant⇄dish pill
 * (`SearchFilters.tsx`). Same mechanism: an absolutely-positioned highlight whose
 * `translateX` + `width` interpolate over a 0→N-1 progress value across the
 * `onLayout`-measured segments, with each label cross-fading between a dark
 * (inactive) and white (active-on-pill) layer. Travel is distance-aware linear
 * `withTiming` (34–150ms per segment-width). Decoupled from the search runtime and
 * the frosted-glass hole-punch overlay, so it drops onto any (incl. white) surface.
 * Consumers: polls feed Live/Results, bookmarks Restaurants/Dishes, profile
 * Created/Contributed/Favorites. Every improvement to the toggle mechanism lands
 * HERE, once — pages never hand-roll segment rows.
 */

const SEGMENT_TRAVEL_MIN_MS = 34;
const SEGMENT_TRAVEL_FULL_MS = 150;
const SEGMENT_TRAVEL_EASING = Easing.linear;

const TOGGLE_BORDER_RADIUS = 8;
const TOGGLE_MIN_HEIGHT = 32;
const TOGGLE_HORIZONTAL_PADDING = 12;
const TOGGLE_VERTICAL_PADDING = 5;

const INACTIVE_LABEL_COLOR = '#111827';
const ACTIVE_LABEL_COLOR = '#ffffff';

const resolveSegmentTravelDurationMs = (from: number, to: number): number => {
  'worklet';
  const distance = Math.abs(to - from);
  return Math.max(SEGMENT_TRAVEL_MIN_MS, Math.round(distance * SEGMENT_TRAVEL_FULL_MS));
};

const areLayoutsEqual = (prev: LayoutRectangle | undefined, next: LayoutRectangle): boolean =>
  prev != null && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.width - next.width) < 0.5;

export type SegmentedToggleOption<T extends string> = {
  label: string;
  value: T;
};

export type SegmentedToggleProps<T extends string> = {
  /** Two or more options, left to right; index i sits at progress i. */
  options: readonly SegmentedToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Pill fill color (defaults to the brand accent). */
  accentColor?: string;
  /**
   * Warm-restore (chrome-swap first frame): seed the measured segment geometry
   * (index-aligned with `options`) so the pill is correctly placed and visible on
   * the FIRST frame after a remount — before any onLayout fires. Pair with
   * `onSegmentLayoutsChange`, which emits the live geometry for caching.
   */
  initialSegmentLayouts?: readonly (LayoutRectangle | undefined)[];
  onSegmentLayoutsChange?: (layouts: (LayoutRectangle | undefined)[]) => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

const DEFAULT_ACCENT = '#ff3368';

/** One segment's cross-fading label pair, driven by its distance from the pill. */
const SegmentLabel = ({
  label,
  index,
  selectionProgress,
  onLayout,
}: {
  label: string;
  index: number;
  selectionProgress: SharedValue<number>;
  onLayout: (event: LayoutChangeEvent) => void;
}) => {
  const activeStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - Math.abs(selectionProgress.value - index)),
  }));
  const inactiveStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(selectionProgress.value - index)),
  }));
  return (
    <View onLayout={onLayout} style={styles.option}>
      <View style={styles.labelStack}>
        {/* Invisible measuring label reserves the segment width. */}
        <Text
          numberOfLines={1}
          variant="caption"
          weight="semibold"
          style={[styles.label, styles.labelMeasure]}
        >
          {label}
        </Text>
        <Reanimated.View pointerEvents="none" style={[styles.labelLayer, inactiveStyle]}>
          <Text numberOfLines={1} variant="caption" weight="semibold" style={styles.label}>
            {label}
          </Text>
        </Reanimated.View>
        <Reanimated.View pointerEvents="none" style={[styles.labelLayer, activeStyle]}>
          <Text
            numberOfLines={1}
            variant="caption"
            weight="semibold"
            style={[styles.label, styles.labelActive]}
          >
            {label}
          </Text>
        </Reanimated.View>
      </View>
    </View>
  );
};

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  accentColor = DEFAULT_ACCENT,
  initialSegmentLayouts,
  onSegmentLayoutsChange,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: SegmentedToggleProps<T>) {
  const indexFor = React.useCallback(
    (val: T): number =>
      Math.max(
        0,
        options.findIndex((option) => option.value === val)
      ),
    [options]
  );

  const selectionProgress = useSharedValue(indexFor(value));
  const targetProgress = useSharedValue(indexFor(value));
  // Segment geometry as arrays (reassigned whole on change — Reanimated reacts to
  // the reference swap). Index-aligned with `options`. Seeded from the warm-restore
  // cache so a remount paints the pill correctly on its first frame.
  const initialGeometryRef = React.useRef<{ xs: number[]; widths: number[] } | null>(null);
  if (initialGeometryRef.current == null) {
    initialGeometryRef.current = {
      xs: options.map((_option, i) => initialSegmentLayouts?.[i]?.x ?? 0),
      widths: options.map((_option, i) => initialSegmentLayouts?.[i]?.width ?? 0),
    };
  }
  const segmentXs = useSharedValue<number[]>(initialGeometryRef.current.xs);
  const segmentWidths = useSharedValue<number[]>(initialGeometryRef.current.widths);
  const layoutReady = useSharedValue(
    initialGeometryRef.current.widths.every((width) => width > 0) ? 1 : 0
  );

  const layoutsRef = React.useRef<(LayoutRectangle | undefined)[]>(
    options.map((_option, i) => initialSegmentLayouts?.[i])
  );
  const onSegmentLayoutsChangeRef = React.useRef(onSegmentLayoutsChange);
  onSegmentLayoutsChangeRef.current = onSegmentLayoutsChange;
  const interactionValueRef = React.useRef<T>(value);
  const hasSyncedRef = React.useRef(false);

  const animateSelection = React.useCallback(
    (val: T, animated: boolean) => {
      const next = indexFor(val);
      const duration = resolveSegmentTravelDurationMs(selectionProgress.value, next);
      targetProgress.value = next;
      if (animated) {
        selectionProgress.value = withTiming(next, {
          duration,
          easing: SEGMENT_TRAVEL_EASING,
        });
      } else {
        selectionProgress.value = next;
      }
    },
    [indexFor, selectionProgress, targetProgress]
  );

  const registerSegmentLayout = React.useCallback(
    (index: number) => (event: LayoutChangeEvent) => {
      const layout = event.nativeEvent.layout;
      const prev = layoutsRef.current[index];
      if (prev && areLayoutsEqual(prev, layout)) {
        return;
      }
      layoutsRef.current[index] = layout;
      // Derive BOTH geometry arrays from the plain-JS layoutsRef, never by reading a
      // shared value back after writing it: Reanimated array shared values do not
      // guarantee JS-thread read-after-write, so a spread of `.value` here silently
      // lost the sibling segment's measurement (pill invisible, active label
      // white-on-white — caught on the Gate 2 sim pass).
      const nextXs = layoutsRef.current.map((entry) => entry?.x ?? 0);
      const nextWidths = layoutsRef.current.map((entry) => entry?.width ?? 0);
      segmentXs.value = nextXs;
      segmentWidths.value = nextWidths;
      if (nextWidths.every((width) => width > 0)) {
        layoutReady.value = 1;
      }
      onSegmentLayoutsChangeRef.current?.([...layoutsRef.current]);
    },
    [segmentXs, segmentWidths, layoutReady]
  );

  // VoiceOver: double-tap advances to the next segment (wrapping) — parity with the
  // original search pill's onAccessibilityTap.
  const handleAccessibilityTap = React.useCallback(() => {
    const next = (indexFor(interactionValueRef.current) + 1) % options.length;
    const nextValue = options[next]?.value;
    if (nextValue == null) {
      return;
    }
    animateSelection(nextValue, true);
    if (nextValue !== interactionValueRef.current) {
      interactionValueRef.current = nextValue;
      onChange(nextValue);
    }
  }, [animateSelection, indexFor, onChange, options]);

  const segmentCount = options.length;
  const highlightStyle = useAnimatedStyle(() => {
    if (segmentCount < 2) {
      return { opacity: 0 };
    }
    const inputRange = segmentXs.value.map((_x, i) => i);
    return {
      opacity: layoutReady.value,
      transform: [
        { translateX: interpolate(selectionProgress.value, inputRange, segmentXs.value) },
      ],
      width: interpolate(selectionProgress.value, inputRange, segmentWidths.value),
    };
  });

  // Follow external `value` changes (e.g. programmatic resets); skip the very first
  // pass so the pill starts settled, not animating in.
  React.useEffect(() => {
    if (!hasSyncedRef.current) {
      interactionValueRef.current = value;
      animateSelection(value, false);
      hasSyncedRef.current = true;
      return;
    }
    if (value === interactionValueRef.current) {
      return;
    }
    interactionValueRef.current = value;
    animateSelection(value, layoutReady.value > 0);
  }, [value, animateSelection, layoutReady]);

  const commit = React.useCallback(
    (nextIndex: number) => {
      const next = options[nextIndex]?.value;
      if (next == null || next === interactionValueRef.current) {
        return;
      }
      interactionValueRef.current = next;
      onChange(next);
    },
    [onChange, options]
  );

  // PRESS-UP, UNBOUNDED (toggle-strip primitive T1/T2): the whole control is ONE target
  // and the commit fires on finger-UP no matter how long the finger was held —
  // `maxDuration` is lifted to effectively-infinite (the RNGH default ~500ms silently
  // discarded a hold-then-release). Movement past the slop still cancels (maxDistance
  // default), so a drag-away remains an escape hatch.
  const tapGesture = React.useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(1e9)
        .shouldCancelWhenOutside(false)
        .onEnd((event, success) => {
          'worklet';
          if (!success) {
            return;
          }
          const xs = segmentXs.value;
          const widths = segmentWidths.value;
          let next = -1;
          if (xs.length === 2) {
            // T2: a 2-position toggle flips on ANY press-up on the control — no
            // segment aiming required. (The old shape only flipped on the inactive
            // side; a press on the active pill was silently ignored.)
            next = targetProgress.value === 0 ? 1 : 0;
          } else {
            for (let i = 0; i < xs.length; i += 1) {
              if (event.x >= xs[i] && event.x <= xs[i] + widths[i]) {
                next = i;
                break;
              }
            }
            if (next === -1) {
              // Gap/padding press on an N-position control: nearest segment center wins
              // (the whole control is the target; dead zones are not).
              let bestDistance = Number.MAX_VALUE;
              for (let i = 0; i < xs.length; i += 1) {
                const distance = Math.abs(event.x - (xs[i] + widths[i] / 2));
                if (distance < bestDistance) {
                  bestDistance = distance;
                  next = i;
                }
              }
            }
          }
          if (next === -1 || next === targetProgress.value) {
            return;
          }
          const duration = resolveSegmentTravelDurationMs(selectionProgress.value, next);
          targetProgress.value = next;
          selectionProgress.value = withTiming(next, {
            duration,
            easing: SEGMENT_TRAVEL_EASING,
          });
          runOnJS(commit)(next);
        }),
    [commit, segmentXs, segmentWidths, selectionProgress, targetProgress]
  );

  return (
    <GestureDetector gesture={tapGesture}>
      <View
        style={styles.control}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? 'Toggle'}
        accessibilityHint={accessibilityHint}
        accessibilityValue={{ text: options[indexFor(value)]?.label }}
        onAccessibilityTap={handleAccessibilityTap}
        testID={testID}
      >
        <Reanimated.View
          pointerEvents="none"
          style={[styles.highlight, { backgroundColor: accentColor }, highlightStyle]}
        />
        {options.map((option, index) => (
          <SegmentLabel
            key={option.value}
            label={option.label}
            index={index}
            selectionProgress={selectionProgress}
            onLayout={registerSegmentLayout(index)}
          />
        ))}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: TOGGLE_BORDER_RADIUS,
    // Transparent track — matches the search segmented control exactly. The frosted
    // cutout window behind the pill is the backdrop; a tinted track here reads as a
    // dark/shadowed box (which search does NOT have).
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
    flexShrink: 0,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: TOGGLE_BORDER_RADIUS,
    height: TOGGLE_MIN_HEIGHT,
    paddingHorizontal: TOGGLE_HORIZONTAL_PADDING,
    paddingVertical: TOGGLE_VERTICAL_PADDING,
    minWidth: 0,
    flexGrow: 0,
    flexShrink: 1,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: TOGGLE_BORDER_RADIUS,
  },
  labelStack: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: INACTIVE_LABEL_COLOR,
  },
  labelActive: {
    color: ACTIVE_LABEL_COLOR,
  },
  labelMeasure: {
    opacity: 0,
  },
});
