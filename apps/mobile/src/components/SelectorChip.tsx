import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { FilterChip } from './FilterChip';

/**
 * THE house dropdown-toggle chip (plans/toggle-strip-primitive.md) — the strip face of a
 * single-select dropdown: shows the CURRENT value (or the selector's noun while at the
 * default), a chevron reflecting the open state, and the accent fill when a non-default
 * value is active. Resurrects the original Local/Global rank chip (git 2839c07a), the
 * same pattern the Price chip carries today. Pair with `OptionSelectorSheet` for the
 * option cards. Press-up semantics come from FilterChip (a plain Pressable — fires on
 * release with no duration ceiling).
 */
export type SelectorChipProps = {
  /** The chip text: the selector noun at default (e.g. "Sort"), the value otherwise. */
  label: string;
  /** Accent-filled when a non-default value is selected. */
  active: boolean;
  /** Chevron direction — the selector sheet's open state. */
  expanded: boolean;
  onPress: () => void;
  accentColor?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function SelectorChip({
  label,
  active,
  expanded,
  onPress,
  accentColor,
  accessibilityLabel,
  style,
  testID,
}: SelectorChipProps) {
  return (
    <FilterChip
      label={label}
      active={active}
      onPress={onPress}
      accentColor={accentColor}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded }}
      style={style}
      testID={testID}
    >
      {(filled) =>
        expanded ? (
          <ChevronUp
            size={16}
            strokeWidth={3}
            color={filled ? '#ffffff' : '#111827'}
            style={{ marginLeft: 6 }}
          />
        ) : (
          <ChevronDown
            size={16}
            strokeWidth={3}
            color={filled ? '#ffffff' : '#111827'}
            style={{ marginLeft: 6 }}
          />
        )
      }
    </FilterChip>
  );
}
