import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from './ui/Text';
import OverlayModalSheet from '../overlays/OverlayModalSheet';
import { OVERLAY_HORIZONTAL_PADDING } from '../overlays/overlaySheetStyles';
import { colors as themeColors } from '../constants/theme';

/**
 * THE house dropdown-toggle sheet (plans/toggle-strip-primitive.md) — the option-card
 * selector a `SelectorChip` opens. Resurrects the original Local/Global rank sheet UI
 * (git 2839c07a): a titled OverlayModalSheet with bordered option cards in a row (they
 * wrap for 3+), a soft accent gradient + tinted border on the selected card, optional
 * per-option icon. Selection is IMMEDIATE: tap an option → `onSelect` → the sheet closes
 * (the modern dropdown contract — no pending/Done round-trip).
 */
export type OptionSelectorSheetOption<T extends string> = {
  value: T;
  label: string;
  /** Optional leading icon; receives the resolved color for the selected state. */
  icon?: (args: { selected: boolean; color: string }) => React.ReactNode;
  accessibilityLabel?: string;
};

export type OptionSelectorSheetProps<T extends string> = {
  visible: boolean;
  title: string;
  options: readonly OptionSelectorSheetOption<T>[];
  value: T;
  onSelect: (value: T) => void;
  onRequestClose: () => void;
  accentColor?: string;
  testID?: string;
};

export function OptionSelectorSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onSelect,
  onRequestClose,
  accentColor = themeColors.primary,
  testID,
}: OptionSelectorSheetProps<T>) {
  return (
    <OverlayModalSheet
      visible={visible}
      onRequestClose={onRequestClose}
      maxBackdropOpacity={0.42}
      paddingHorizontal={OVERLAY_HORIZONTAL_PADDING}
      paddingTop={12}
    >
      <View style={styles.headerRow} testID={testID}>
        <Text variant="subtitle" weight="semibold" style={styles.headline}>
          {title}
        </Text>
      </View>
      <View style={styles.optionsRow}>
        {options.map((option) => {
          const selected = option.value === value;
          const contentColor = selected ? accentColor : themeColors.textPrimary;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                if (!selected) {
                  onSelect(option.value);
                }
                onRequestClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={option.accessibilityLabel ?? `Select ${option.label}`}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.option,
                selected && { backgroundColor: `${accentColor}14`, borderColor: accentColor },
                pressed && { opacity: 0.92 },
              ]}
              testID={testID ? `${testID}-option-${option.value}` : undefined}
            >
              {selected ? (
                <LinearGradient
                  pointerEvents="none"
                  colors={[`${accentColor}1f`, `${accentColor}0a`, 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.optionGradient}
                />
              ) : null}
              {option.icon ? option.icon({ selected, color: contentColor }) : null}
              <Text
                variant="body"
                weight="semibold"
                style={[styles.optionText, selected && { color: accentColor }]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </OverlayModalSheet>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  headline: {
    flex: 1,
    minWidth: 0,
    color: '#0f172a',
  },
  optionsRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 10,
    marginBottom: 20,
  },
  option: {
    height: 44,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '40%',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  optionGradient: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 12,
  },
  optionText: {
    color: '#0f172a',
    textAlign: 'center',
  },
});
