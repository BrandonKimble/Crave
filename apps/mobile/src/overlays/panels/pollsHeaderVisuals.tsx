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
  marketStatus?: 'resolved' | 'multi_market' | 'no_market' | 'error' | null;
  candidateLocalityName?: string | null;
  pollCount?: number;
  isUpdating?: boolean;
  isResolvingMarket?: boolean;
};

const formatPossessivePlace = (value: string): string =>
  value.endsWith('s') ? `${value}'` : `${value}'s`;

export const buildPollsHeaderVisualModel = ({
  marketName,
  marketKey: _marketKey,
  fallbackMarketName,
  marketStatus,
  candidateLocalityName,
  pollCount = 0,
  isUpdating = false,
  isResolvingMarket = false,
}: BuildPollsHeaderVisualModelArgs): PollsHeaderVisualModel => {
  const trimmedMarketName = typeof marketName === 'string' ? marketName.trim() : '';
  const trimmedFallbackMarketName =
    typeof fallbackMarketName === 'string' ? fallbackMarketName.trim() : '';
  const trimmedCandidateLocalityName =
    typeof candidateLocalityName === 'string' ? candidateLocalityName.trim() : '';
  const headerPlaceName =
    trimmedMarketName || trimmedFallbackMarketName || trimmedCandidateLocalityName;

  const title = isResolvingMarket
    ? 'Finding local polls...'
    : pollCount === 0 && headerPlaceName
    ? `Start ${formatPossessivePlace(headerPlaceName)} first poll`
    : pollCount === 0
    ? 'Start the first poll here'
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
