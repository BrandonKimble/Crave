import React from 'react';
import { StyleSheet } from 'react-native';

import { Text } from '../../components';
import { colors as themeColors } from '../../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';

// The polls header now uses the standardized single header (title + close cutout only) — the
// live-count badge cutout was removed 2026-07-01 (page-switch-master-plan.md). Only the TITLE model
// remains.
export type PollsHeaderVisualModel = {
  title: string;
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
  candidateLocalityName,
  pollCount = 0,
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

  return { title };
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

const styles = StyleSheet.create({
  sheetTitle: {
    fontSize: FONT_SIZES.title,
    lineHeight: LINE_HEIGHTS.title,
    color: themeColors.text,
    flex: 1,
    marginRight: 12,
    minWidth: 0,
  },
});

export const pollsHeaderVisualStyles = styles;
