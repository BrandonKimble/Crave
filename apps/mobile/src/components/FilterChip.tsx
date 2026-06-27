import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from './ui/Text';

/**
 * Small pill-shaped filter chip for the polls feed strip (§4/§6) — Sort / Type /
 * Time selectors. Inactive: bordered surface with dark label; active: accent fill
 * with white label. Pairs with `SegmentedToggle` (the primary Live/Results pill).
 */

const ACCENT = '#ff3368';
const INACTIVE_LABEL = '#111827';
const ACTIVE_LABEL = '#ffffff';

export type FilterChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  accentColor?: string;
  accessibilityLabel?: string;
  testID?: string;
};

export function FilterChip({
  label,
  active,
  onPress,
  accentColor = ACCENT,
  accessibilityLabel,
  testID,
}: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active ? { backgroundColor: accentColor } : null,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      hitSlop={6}
    >
      <Text
        numberOfLines={1}
        variant="caption"
        weight="semibold"
        style={[styles.label, active ? styles.labelActive : null]}
      >
        {label}
      </Text>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: INACTIVE_LABEL,
  },
  labelActive: {
    color: ACTIVE_LABEL,
  },
});
