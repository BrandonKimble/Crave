import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '../../components';
import { colors as themeColors } from '../../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';
import { OVERLAY_HEADER_CLOSE_BUTTON_SIZE } from '../overlaySheetStyles';

const ACCENT = themeColors.primary;
const LIVE_BADGE_HEIGHT = OVERLAY_HEADER_CLOSE_BUTTON_SIZE;

export type PollsHeaderVisualModel = {
  title: string;
  badgeCount: string;
  badgeLabel: string;
  isBadgeMuted: boolean;
};

type BuildPollsHeaderVisualModelArgs = {
  coverageName?: string | null;
  coverageKey?: string | null;
  fallbackCoverageName?: string | null;
  pollCount?: number;
  isUpdating?: boolean;
  isResolvingLocation?: boolean;
};

export const buildPollsHeaderVisualModel = ({
  coverageName,
  coverageKey: _coverageKey,
  fallbackCoverageName,
  pollCount = 0,
  isUpdating = false,
  isResolvingLocation = false,
}: BuildPollsHeaderVisualModelArgs): PollsHeaderVisualModel => {
  const trimmedCoverageName = typeof coverageName === 'string' ? coverageName.trim() : '';
  const trimmedFallbackCoverageName =
    typeof fallbackCoverageName === 'string' ? fallbackCoverageName.trim() : '';
  return {
    title: isResolvingLocation
      ? 'Finding location...'
      : trimmedCoverageName
      ? `Polls in ${trimmedCoverageName}`
      : trimmedFallbackCoverageName
      ? `Polls in ${trimmedFallbackCoverageName}`
      : 'Polls',
    badgeCount: isUpdating ? '--' : String(pollCount),
    badgeLabel: isUpdating ? 'updating' : 'live',
    isBadgeMuted: isUpdating || pollCount <= 0,
  };
};

export const PollsHeaderTitleText: React.FC<{ title: string }> = ({ title }) => (
  <Text
    variant="title"
    weight="semibold"
    style={styles.sheetTitle}
    numberOfLines={1}
    ellipsizeMode="tail"
  >
    {title}
  </Text>
);

export const PollsHeaderBadge: React.FC<{
  count: string;
  label: string;
  muted?: boolean;
}> = ({ count, label, muted = false }) => (
  <View style={styles.liveBadgeShell}>
    <View style={styles.liveBadgeContent} pointerEvents="none">
      <Text
        variant="title"
        weight="semibold"
        style={[styles.liveBadgeText, muted && styles.liveBadgeTextMuted]}
      >
        {count}
      </Text>
      <Text
        variant="title"
        weight="semibold"
        style={[styles.liveBadgeText, muted && styles.liveBadgeTextMuted]}
      >
        {label}
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  sheetTitle: {
    fontSize: FONT_SIZES.title,
    lineHeight: LINE_HEIGHTS.title,
    color: themeColors.text,
    flex: 1,
    marginRight: 12,
    minWidth: 0,
  },
  liveBadgeShell: {
    height: LIVE_BADGE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: LIVE_BADGE_HEIGHT / 2,
    backgroundColor: 'transparent',
  },
  liveBadgeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveBadgeText: {
    color: ACCENT,
  },
  liveBadgeTextMuted: {
    color: themeColors.text,
  },
});

export const pollsHeaderVisualStyles = styles;
