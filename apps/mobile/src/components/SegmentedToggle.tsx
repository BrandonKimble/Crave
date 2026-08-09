import React from 'react';
import { type LayoutChangeEvent, type LayoutRectangle, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { buildTogglePressGesture } from '../toggles/toggle-press-gesture';
import {
  ToggleStripSlotKeyContext,
  ToggleStripWarmRestoreContext,
} from '../toggles/toggle-strip-warm-restore-context';
import { Text } from './ui/Text';
import { colors as themeColors } from '../constants/theme';
import {
  CONTROL_HEIGHT,
  CONTROL_RADIUS,
  CONTROL_VERTICAL_PADDING,
} from '../screens/Search/constants/ui';

/**
 * N-position sliding-pill segmented toggle — THE house toggle primitive, a
 * self-contained, reusable mirror of the search restaurant⇄dish pill
 * (`SearchFilters.tsx`). Same mechanism: an absolutely-positioned highlight whose
 * `translateX` + `width` interpolate over a 0→N-1 progress value across the
 * `onLayout`-measured segments, with each label cross-fading between a dark
 * (inactive) and white (active-on-pill) layer. Travel is distance-aware linear
 * `withTiming`: 34ms floor, 150ms PER SEGMENT CROSSED — so a 3-position end-to-end jump
 * animates ~300ms, not 150. (F896, 2026-08-03: the header used to promise a "34–150ms"
 * CEILING while `resolveSegmentTravelDurationMs` multiplies 150 by a distance measured in
 * SEGMENT-INDEX units, which has no ceiling. The formula is the intended behavior — longer
 * travel should take longer — so the CLAIM was corrected, not the code.) Decoupled from the search runtime and
 * the frosted-glass hole-punch overlay, so it drops onto any (incl. white) surface.
 * Consumers: search restaurant⇄dish, polls feed Live/Results, lists
 * Restaurants/Dishes, SaveList/ListEdit visibility flips. (A "profile
 * Created/Contributed/Favorites" consumer used to be listed here — it never
 * existed; stale-doc fix, red-team G7 2026-08-08.) Every improvement to the toggle
 * mechanism lands HERE, once — pages never hand-roll segment rows.
 *
 * WARM RESTORE is the strip engine's (leg 2): inside a `ToggleStrip`, the pill
 * self-seeds its measured segment geometry from the strip's warm-restore context
 * (keyed by its hole-slot key) and self-reports live geometry back — so a remounted
 * strip paints the pill correctly on its FIRST frame with zero consumer join code.
 * Outside a strip the contexts are null and the pill simply measures on mount.
 */

const SEGMENT_TRAVEL_MIN_MS = 34;
const SEGMENT_TRAVEL_FULL_MS = 150;
const SEGMENT_TRAVEL_EASING = Easing.linear;

const TOGGLE_HORIZONTAL_PADDING = 12;

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
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

const DEFAULT_ACCENT = themeColors.primary;

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

  // Strip-engine warm restore: inside a ToggleStrip both contexts are present and the
  // pill seeds/reports through them; standalone (form contexts) both are null.
  const stripSlotKey = React.useContext(ToggleStripSlotKeyContext);
  const stripWarmRestore = React.useContext(ToggleStripWarmRestoreContext);
  const initialSegmentLayoutsRef = React.useRef<
    readonly (LayoutRectangle | undefined)[] | undefined
  >(undefined);
  if (initialSegmentLayoutsRef.current === undefined) {
    initialSegmentLayoutsRef.current =
      (stripSlotKey != null ? stripWarmRestore?.readControlSeed(stripSlotKey) : undefined) ?? [];
  }
  const initialSegmentLayouts = initialSegmentLayoutsRef.current;

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
      // NOTE (F896): `runOnJS` below is called from the JS thread, where it is a plain
      // pass-through. Harmless, but it reads as a worklet marker to every future reader —
      // this callback is NOT a worklet.
      const nextXs = layoutsRef.current.map((entry) => entry?.x ?? 0);
      const nextWidths = layoutsRef.current.map((entry) => entry?.width ?? 0);
      segmentXs.value = nextXs;
      segmentWidths.value = nextWidths;
      if (nextWidths.every((width) => width > 0)) {
        layoutReady.value = 1;
        runOnJS(setAnimatedPillReady)(true);
      }
      if (stripSlotKey != null && stripWarmRestore != null) {
        stripWarmRestore.reportControlLayouts(stripSlotKey, [...layoutsRef.current]);
      }
    },
    [segmentXs, segmentWidths, layoutReady, stripSlotKey, stripWarmRestore]
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
  // LAYOUT-FIRST FIRST PAINT (2026-08-01). The animated pill can only be
  // positioned once every segment has MEASURED, so on a first-ever mount (no
  // warm seed) it stays invisible until onLayout lands — which is after paint,
  // behind whatever else the JS thread is doing. That is the toggle strip
  // "coming in late". A layout-positioned twin paints the selected segment's
  // pill on frame ONE (it needs no measurement — flex already knows where the
  // segment is) and disappears the moment the animated one is ready, so the
  // control is never in a state where its selection is invisible.
  const hasSeededGeometry = initialGeometryRef.current.widths.every((width) => width > 0);
  const [animatedPillReady, setAnimatedPillReady] = React.useState(hasSeededGeometry);
  const selectedIndexForPaint = indexFor(value);
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
  // and the commit fires on finger-UP no matter how long the finger was held. The tap
  // config lives in the shared press layer (`buildTogglePressGesture` — one press feel,
  // stated once; FilterChip rides the same builder). No `pressedProgress` here by
  // ruling: the pill's pressed face is its traveling highlight, launched below.
  const tapGesture = React.useMemo(
    () =>
      buildTogglePressGesture({
        onEndWorklet: (event, success) => {
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
        },
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
        {!animatedPillReady && segmentCount >= 2 ? (
          <View style={styles.layoutFirstPillRow} pointerEvents="none">
            {options.map((option, index) => (
              <View key={option.value} style={styles.layoutFirstPillCell}>
                {index === selectedIndexForPaint ? (
                  <View
                    style={[styles.layoutFirstPill, { backgroundColor: accentColor }]}
                    pointerEvents="none"
                  />
                ) : null}
                {/* THE TWIN'S WIDTH SOURCE (red-team F-1, 2026-08-09): each twin
                    cell renders the SAME invisible measuring label inside the
                    SAME `styles.option` box the real row uses — so the cell's
                    intrinsic width equals the real segment's BY CONSTRUCTION
                    (same content, same style object — never copied constants).
                    An empty cell has intrinsic width 0 and the frame-1 pill
                    would be a 0-wide box: the twin's whole charter violated.
                    The pill absolute-fills the CELL (not the padded option box)
                    because Yoga insets absolute children by parent padding —
                    the animated pill spans the full measured segment width,
                    padding included, and the twin must match it. */}
                <View style={styles.option}>
                  <Text
                    numberOfLines={1}
                    variant="caption"
                    weight="semibold"
                    style={[styles.label, styles.labelMeasure]}
                  >
                    {option.label}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
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
    borderRadius: CONTROL_RADIUS,
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
    borderRadius: CONTROL_RADIUS,
    height: CONTROL_HEIGHT,
    paddingHorizontal: TOGGLE_HORIZONTAL_PADDING,
    paddingVertical: CONTROL_VERTICAL_PADDING,
    minWidth: 0,
    flexGrow: 0,
    flexShrink: 1,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: CONTROL_RADIUS,
  },
  // The layout-first pill: same row geometry as the labels, so flex puts it
  // exactly where the animated pill will land — no measurement required.
  layoutFirstPillRow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  // The twin cell mirrors the real segment's flex parameters; its WIDTH comes
  // from the `styles.option` + measuring-label child it renders (the same
  // content the real row measures), never from a copied constant.
  layoutFirstPillCell: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  layoutFirstPill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: CONTROL_RADIUS,
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
