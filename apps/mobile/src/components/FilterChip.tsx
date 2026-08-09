import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { buildTogglePressGesture } from '../toggles/toggle-press-gesture';
import { Text } from './ui/Text';
import { colors as themeColors } from '../constants/theme';
import { CONTROL_HEIGHT, CONTROL_RADIUS } from '../screens/Search/constants/ui';

/**
 * THE house filter chip — the shared pill for every strip (search results, polls
 * feed, favorites next). Inactive: a dark label over its frosted cutout window;
 * active: accent fill with a white label. Pairs with `SegmentedToggle` (the sliding
 * pill) and rides the SAME press layer (`buildTogglePressGesture` — G3, red-team
 * 2026-08-08): a UI-thread tap worklet with unbounded press-up (T1/T2) and a
 * UI-thread pressed dim, so chip and pill are indistinguishable at the finger under
 * rapid taps on 120Hz. (The chip's FILL swap is still a JS re-render on commit; the
 * pressed dim is the instant acknowledgment that used to be missing — the old shape
 * was a JS-thread Pressable with no pressed state at all.) Variants:
 * - 'default' — the toggle chip (accent fill when active).
 * - 'quiet'   — the muted informational species (search's "N similar" remote
 *   control): never accent-filled, gray label.
 * `children` may be a render-prop of `active` for trailing content whose color
 * follows the active state (the price chevron). No hitSlop: chips sit 8px apart in
 * the strips — slop would make presses between chips ambiguous.
 */

const ACCENT = themeColors.primary;
const INACTIVE_LABEL = '#111827';
const ACTIVE_LABEL = '#ffffff';
const QUIET_LABEL = '#6b7280';
/** Pressed-face floor: standard touch acknowledgment, resting state untouched. */
const PRESSED_MIN_OPACITY = 0.6;

export type FilterChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  accentColor?: string;
  variant?: 'default' | 'quiet';
  /** Trailing content; a function receives the active state (e.g. chevron color). */
  children?: React.ReactNode | ((active: boolean) => React.ReactNode);
  /** Extra accessibility state merged over `{ selected: active }` (e.g. `expanded`). */
  accessibilityState?: { expanded?: boolean };
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
};

export function FilterChip({
  label,
  active,
  onPress,
  accentColor = ACCENT,
  variant = 'default',
  children,
  accessibilityState,
  style,
  accessibilityLabel,
  testID,
}: FilterChipProps) {
  const isQuiet = variant === 'quiet';
  const filled = active && !isQuiet;
  // Latest-value ref + stable trampoline: the gesture is built once, the press
  // handler may change every render.
  const onPressRef = React.useRef(onPress);
  onPressRef.current = onPress;
  const firePress = React.useCallback(() => {
    onPressRef.current();
  }, []);
  const pressedProgress = useSharedValue(0);
  const gesture = React.useMemo(
    () =>
      buildTogglePressGesture({
        pressedProgress,
        onEndWorklet: (_event, success) => {
          'worklet';
          if (!success) {
            return;
          }
          runOnJS(firePress)();
        },
      }),
    [firePress, pressedProgress]
  );
  const pressedStyle = useAnimatedStyle(() => ({
    opacity: 1 - (1 - PRESSED_MIN_OPACITY) * pressedProgress.value,
  }));
  return (
    <GestureDetector gesture={gesture}>
      <Reanimated.View
        style={[styles.chip, filled ? { backgroundColor: accentColor } : null, style, pressedStyle]}
        accessible
        accessibilityRole="button"
        accessibilityState={{ selected: active, ...accessibilityState }}
        accessibilityLabel={accessibilityLabel ?? label}
        onAccessibilityTap={firePress}
        testID={testID}
      >
        <Text
          numberOfLines={1}
          variant="caption"
          weight="semibold"
          style={[
            styles.label,
            isQuiet ? styles.labelQuiet : null,
            filled ? styles.labelActive : null,
          ]}
        >
          {label}
        </Text>
        {typeof children === 'function' ? children(filled) : children}
      </Reanimated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  chip: {
    // No border — search's filter buttons are borderless; the inactive chip is just a
    // dark label sitting over its frosted cutout window, the accent fills only when active.
    height: CONTROL_HEIGHT,
    paddingHorizontal: 12,
    borderRadius: CONTROL_RADIUS,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: INACTIVE_LABEL,
  },
  labelActive: {
    color: ACTIVE_LABEL,
  },
  labelQuiet: {
    color: QUIET_LABEL,
  },
});
