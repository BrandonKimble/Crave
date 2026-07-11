import React from 'react';
import {
  Image,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { Text } from './ui/Text';

// ─── THE monogram avatar (W2 consolidation) ──────────────────────────────────────────────────
// One component for every person avatar in the app: renders the remote image when a URL
// exists, otherwise a deterministic-color circle (ListDetailPanel's §8.1 collaborator-stack
// version was the base) with the title's first initial. Per-site size/typography/border ride
// props; the color is a pure function of the seed so the same user is the same color on
// every surface.

const MONOGRAM_COLORS = [
  '#0ea5e9',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#6366f1',
  '#14b8a6',
] as const;

export const monogramColorFor = (seed: string): string => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return MONOGRAM_COLORS[hash % MONOGRAM_COLORS.length];
};

export type MonogramAvatarProps = {
  /** Deterministic color seed — pass the userId (stable across renames). Falls back to title. */
  seed?: string | null;
  avatarUrl?: string | null;
  /** Display name; its first character is the monogram (unless `monogram` overrides). */
  title: string;
  /** Explicit monogram text (e.g. two-letter initials) — overrides the derived initial. */
  monogram?: string;
  size: number;
  testID?: string;
  /** Extra style for the circle (border, margins, z-index for stacks…). Applied to BOTH the
   *  image and the fallback so the two render paths stay geometry-identical. */
  style?: StyleProp<ViewStyle>;
  textVariant?: 'caption' | 'body' | 'title';
  textStyle?: StyleProp<TextStyle>;
};

export const MonogramAvatar = ({
  seed,
  avatarUrl,
  title,
  monogram,
  size,
  testID,
  style,
  textVariant = 'body',
  textStyle,
}: MonogramAvatarProps) => {
  const frame = { width: size, height: size, borderRadius: size / 2 } as const;
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[frame, style as StyleProp<ImageStyle>]}
        testID={testID}
      />
    );
  }
  const initial = monogram ?? (title.trim().charAt(0).toUpperCase() || 'C');
  return (
    <View
      testID={testID}
      style={[
        frame,
        {
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: monogramColorFor(seed || title),
        },
        style,
      ]}
    >
      <Text variant={textVariant} weight="semibold" style={[{ color: '#ffffff' }, textStyle]}>
        {initial}
      </Text>
    </View>
  );
};
