import React from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './ui/Text';

/**
 * THE house filter chip — the shared pill for every strip (search results, polls
 * feed, favorites next). Inactive: a dark label over its frosted cutout window;
 * active: accent fill with a white label. Pairs with `SegmentedToggle` (the sliding
 * pill). Variants:
 * - 'default' — the toggle chip (accent fill when active).
 * - 'quiet'   — the muted informational species (search's "N similar" remote
 *   control): never accent-filled, gray label.
 * `children` may be a render-prop of `active` for trailing content whose color
 * follows the active state (the price chevron). No hitSlop: chips sit 8px apart in
 * the strips — slop would make presses between chips ambiguous.
 */

const ACCENT = '#ff3368';
const INACTIVE_LABEL = '#111827';
const ACTIVE_LABEL = '#ffffff';
const QUIET_LABEL = '#6b7280';

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
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, filled ? { backgroundColor: accentColor } : null, style]}
      accessibilityRole="button"
      accessibilityState={{ selected: active, ...accessibilityState }}
      accessibilityLabel={accessibilityLabel ?? label}
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    // No border — search's filter buttons are borderless; the inactive chip is just a
    // dark label sitting over its frosted cutout window, the accent fills only when active.
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
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
