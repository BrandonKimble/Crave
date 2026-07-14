import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { HandPlatter, Heart, Phone, Share as LucideShare } from 'lucide-react-native';

import { Text } from '../..';
import { colors as themeColors } from '../../../constants/theme';
import { CONTENT_HORIZONTAL_PADDING } from '../../../screens/Search/constants/search';

// ─── The card PILL ACTION ROW (wave-3 charter §3.1 — the Google reference, recolored) ────────
// Rounded pills under every result card: PRIMARY at low opacity for the bodies, the darker
// primary for text/icons. Vocabulary: **Save** (heart — the favorites term is dead) · Share ·
// Call · Dishes (restaurant cards ONLY). Scrollable-strip physics like everything else
// (edge-to-edge bleed, content aligned by scrollable inset — §2.4's toggle-strip law); the
// heart/share buttons that used to float on the card body MOVE here.

const PILL_BODY = 'rgba(255, 51, 104, 0.10)'; // themeColors.primary (#ff3368) @ 10%
const PILL_INK = themeColors.primaryDark; // the darker primary for text/icons
const PILL_ICON_SIZE = 16;

type Pill = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
};

export type CardActionPillRowProps = {
  onSave: () => void;
  isSaved?: boolean;
  onShare: () => void;
  /** Null/absent = no Call pill (honest absence, never a dead button). */
  phoneNumber?: string | null;
  /** Restaurant cards only — opens the restaurant's dishes. Absent on dish cards. */
  onDishes?: (() => void) | null;
  testID?: string;
};

const CardActionPillRow: React.FC<CardActionPillRowProps> = ({
  onSave,
  isSaved = false,
  onShare,
  phoneNumber = null,
  onDishes = null,
  testID,
}) => {
  const handleCall = React.useCallback(() => {
    if (phoneNumber) {
      void Linking.openURL(`tel:${phoneNumber.replace(/[^+\d]/g, '')}`).catch(() => undefined);
    }
  }, [phoneNumber]);

  const pills: Pill[] = [
    {
      key: 'save',
      label: 'Save',
      icon: (
        <Heart
          size={PILL_ICON_SIZE}
          color={PILL_INK}
          fill={isSaved ? PILL_INK : 'none'}
          strokeWidth={2}
        />
      ),
      onPress: onSave,
      accessibilityLabel: isSaved ? 'Saved' : 'Save',
    },
    {
      key: 'share',
      label: 'Share',
      icon: <LucideShare size={PILL_ICON_SIZE} color={PILL_INK} strokeWidth={2} />,
      onPress: onShare,
    },
    ...(phoneNumber
      ? [
          {
            key: 'call',
            label: 'Call',
            icon: <Phone size={PILL_ICON_SIZE} color={PILL_INK} strokeWidth={2} />,
            onPress: handleCall,
          },
        ]
      : []),
    ...(onDishes
      ? [
          {
            key: 'dishes',
            label: 'Dishes',
            icon: <HandPlatter size={PILL_ICON_SIZE} color={PILL_INK} strokeWidth={2} />,
            onPress: onDishes,
          },
        ]
      : []),
  ];

  return (
    // Full-bleed strip: escape the card's gutter, align the first pill back to it
    // with a SCROLLABLE inset (§2.4 — pills slide under both screen edges).
    <View style={styles.bleed}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        alwaysBounceHorizontal
        contentContainerStyle={styles.content}
        testID={testID}
      >
        {pills.map((pill) => (
          <Pressable
            key={pill.key}
            onPress={pill.onPress}
            accessibilityRole="button"
            accessibilityLabel={pill.accessibilityLabel ?? pill.label}
            style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
            testID={testID ? `${testID}-${pill.key}` : undefined}
          >
            {pill.icon}
            <Text variant="caption" weight="semibold" style={styles.pillLabel}>
              {pill.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  bleed: {
    marginHorizontal: -CONTENT_HORIZONTAL_PADDING,
    marginTop: 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PILL_BODY,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillPressed: {
    opacity: 0.7,
  },
  pillLabel: {
    color: PILL_INK,
  },
});

export default React.memo(CardActionPillRow);
