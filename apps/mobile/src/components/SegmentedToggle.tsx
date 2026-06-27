import React from 'react';
import {
  type LayoutChangeEvent,
  type LayoutRectangle,
  StyleSheet,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text } from './ui/Text';

/**
 * Two-position sliding-pill segmented toggle — a self-contained, reusable mirror of
 * the search restaurant⇄dish pill (`SearchFilters.tsx`). Same mechanism: an
 * absolutely-positioned highlight whose `translateX` + `width` interpolate over a
 * 0→1 progress value across the two `onLayout`-measured segments, with the labels
 * cross-fading between a dark (inactive) and white (active-on-pill) layer. Travel is
 * distance-aware linear `withTiming` (34–150ms). Decoupled from the search runtime
 * and the frosted-glass hole-punch overlay, so it drops onto any (incl. white)
 * surface. Drives the polls feed Live/Results split (§4/§6).
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

const areLayoutsEqual = (
  prev: LayoutRectangle | undefined,
  next: LayoutRectangle,
): boolean =>
  prev != null &&
  Math.abs(prev.x - next.x) < 0.5 &&
  Math.abs(prev.width - next.width) < 0.5;

export type SegmentedToggleOption<T extends string> = {
  label: string;
  value: T;
};

export type SegmentedToggleProps<T extends string> = {
  /** Exactly two options; index 0 is the left segment (progress 0). */
  options: readonly [SegmentedToggleOption<T>, SegmentedToggleOption<T>];
  value: T;
  onChange: (value: T) => void;
  /** Pill fill color (defaults to the brand accent). */
  accentColor?: string;
  accessibilityLabel?: string;
  testID?: string;
};

const DEFAULT_ACCENT = '#ff3368';

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  accentColor = DEFAULT_ACCENT,
  accessibilityLabel,
  testID,
}: SegmentedToggleProps<T>) {
  const [first, second] = options;
  const progressFor = React.useCallback(
    (val: T): 0 | 1 => (val === first.value ? 0 : 1),
    [first.value],
  );

  const selectionProgress = useSharedValue(progressFor(value));
  const targetProgress = useSharedValue(progressFor(value));
  const firstX = useSharedValue(0);
  const firstWidth = useSharedValue(0);
  const secondX = useSharedValue(0);
  const secondWidth = useSharedValue(0);
  const layoutReady = useSharedValue(0);

  const layoutsRef = React.useRef<Partial<Record<T, LayoutRectangle>>>({});
  const interactionValueRef = React.useRef<T>(value);
  const hasSyncedRef = React.useRef(false);

  const animateSelection = React.useCallback(
    (val: T, animated: boolean) => {
      const next = progressFor(val);
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
    [progressFor, selectionProgress, targetProgress],
  );

  const registerSegmentLayout = React.useCallback(
    (val: T) => (event: LayoutChangeEvent) => {
      const layout = event.nativeEvent.layout;
      const prev = layoutsRef.current[val];
      if (prev && areLayoutsEqual(prev, layout)) {
        return;
      }
      layoutsRef.current[val] = layout;
      if (val === first.value) {
        firstX.value = layout.x;
        firstWidth.value = layout.width;
      } else {
        secondX.value = layout.x;
        secondWidth.value = layout.width;
      }
      const a = layoutsRef.current[first.value];
      const b = layoutsRef.current[second.value];
      if (a?.width && a.width > 0 && b?.width && b.width > 0) {
        layoutReady.value = 1;
      }
    },
    [first.value, second.value, firstX, firstWidth, secondX, secondWidth, layoutReady],
  );

  const highlightStyle = useAnimatedStyle(() => ({
    opacity: layoutReady.value,
    transform: [
      {
        translateX: interpolate(
          selectionProgress.value,
          [0, 1],
          [firstX.value, secondX.value],
        ),
      },
    ],
    width: interpolate(selectionProgress.value, [0, 1], [firstWidth.value, secondWidth.value]),
  }));
  const firstActiveStyle = useAnimatedStyle(() => ({
    opacity: 1 - selectionProgress.value,
  }));
  const firstInactiveStyle = useAnimatedStyle(() => ({
    opacity: selectionProgress.value,
  }));
  const secondActiveStyle = useAnimatedStyle(() => ({
    opacity: selectionProgress.value,
  }));
  const secondInactiveStyle = useAnimatedStyle(() => ({
    opacity: 1 - selectionProgress.value,
  }));

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
    (next: T) => {
      if (next === interactionValueRef.current) {
        return;
      }
      interactionValueRef.current = next;
      onChange(next);
    },
    [onChange],
  );

  const tapGesture = React.useMemo(
    () =>
      Gesture.Tap()
        .shouldCancelWhenOutside(false)
        .onEnd((_event, success) => {
          if (!success) {
            return;
          }
          const next = targetProgress.value === 0 ? 1 : 0;
          const duration = resolveSegmentTravelDurationMs(selectionProgress.value, next);
          targetProgress.value = next;
          selectionProgress.value = withTiming(next, {
            duration,
            easing: SEGMENT_TRAVEL_EASING,
          });
          runOnJS(commit)(next === 0 ? first.value : second.value);
        }),
    [commit, first.value, second.value, selectionProgress, targetProgress],
  );

  const renderSegment = (
    option: SegmentedToggleOption<T>,
    activeStyle: ReturnType<typeof useAnimatedStyle>,
    inactiveStyle: ReturnType<typeof useAnimatedStyle>,
  ) => (
    <View
      key={option.value}
      onLayout={registerSegmentLayout(option.value)}
      style={styles.option}
    >
      <View style={styles.labelStack}>
        {/* Invisible measuring label reserves the segment width. */}
        <Text
          numberOfLines={1}
          variant="caption"
          weight="semibold"
          style={[styles.label, styles.labelMeasure]}
        >
          {option.label}
        </Text>
        <Reanimated.View pointerEvents="none" style={[styles.labelLayer, inactiveStyle]}>
          <Text numberOfLines={1} variant="caption" weight="semibold" style={styles.label}>
            {option.label}
          </Text>
        </Reanimated.View>
        <Reanimated.View pointerEvents="none" style={[styles.labelLayer, activeStyle]}>
          <Text
            numberOfLines={1}
            variant="caption"
            weight="semibold"
            style={[styles.label, styles.labelActive]}
          >
            {option.label}
          </Text>
        </Reanimated.View>
      </View>
    </View>
  );

  return (
    <GestureDetector gesture={tapGesture}>
      <View
        style={styles.control}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? 'Toggle'}
        accessibilityState={{ selected: value === second.value }}
        testID={testID}
      >
        <Reanimated.View
          pointerEvents="none"
          style={[styles.highlight, { backgroundColor: accentColor }, highlightStyle]}
        />
        {renderSegment(first, firstActiveStyle, firstInactiveStyle)}
        {renderSegment(second, secondActiveStyle, secondInactiveStyle)}
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
