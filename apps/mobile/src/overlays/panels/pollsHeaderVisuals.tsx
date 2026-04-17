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
  marketName?: string | null;
  marketKey?: string | null;
  fallbackMarketName?: string | null;
  marketStatus?: 'resolved' | 'no_market' | 'error' | null;
  candidatePlaceName?: string | null;
  pollCount?: number;
  isUpdating?: boolean;
  isResolvingMarket?: boolean;
};

export const buildPollsHeaderVisualModel = ({
  marketName,
  marketKey: _marketKey,
  fallbackMarketName,
  marketStatus,
  candidatePlaceName,
  pollCount = 0,
  isUpdating = false,
  isResolvingMarket = false,
}: BuildPollsHeaderVisualModelArgs): PollsHeaderVisualModel => {
  const trimmedMarketName = typeof marketName === 'string' ? marketName.trim() : '';
  const trimmedFallbackMarketName =
    typeof fallbackMarketName === 'string' ? fallbackMarketName.trim() : '';
  const trimmedCandidatePlaceName =
    typeof candidatePlaceName === 'string' ? candidatePlaceName.trim() : '';

  const title = isResolvingMarket
    ? 'Finding market...'
    : marketStatus === 'no_market' && trimmedCandidatePlaceName
      ? `No polls in ${trimmedCandidatePlaceName} yet`
      : marketStatus === 'no_market'
        ? 'No local polls here yet'
        : trimmedMarketName
          ? `Polls in ${trimmedMarketName}`
          : trimmedFallbackMarketName
            ? `Polls in ${trimmedFallbackMarketName}`
            : 'Polls';

  return {
    title,
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
