import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { HandPlatter, Store, TrendingUp, Trophy, X as LucideX } from 'lucide-react-native';

import { OptionSelectorSheet, Text } from '../../../components';
import type { SearchSortMode } from '../hooks/use-search-filter-modal-owner';
import OverlayModalSheet from '../../../overlays/OverlayModalSheet';
import { colors as themeColors } from '../../../constants/theme';
import { CONTENT_HORIZONTAL_PADDING, SECONDARY_METRIC_ICON_SIZE } from '../constants/search';
import { PollIcon, VoteIcon } from './metric-icons';
import { formatCraveScoreMovementDetail } from '../utils/quality';
import CraveScoreText from './CraveScoreText';
import styles from '../styles';

export type ScoreInfoPayload = {
  type: 'dish' | 'restaurant';
  title: string;
  score: number | null | undefined;
  rising: number | null | undefined;
  votes: number | null | undefined;
  polls: number | null | undefined;
};

const MemoOverlayModalSheet = React.memo(
  OverlayModalSheet,
  (prev, next) => !prev.visible && !next.visible
);

// The SORT dropdown options (owner spec 2026-07-12): the resurrected Local/Global rank
// sheet, re-purposed — Best is the silent crave-score default, Rising rides the
// existing rising filter through the chip-rerun choreography.
const SORT_OPTIONS = [
  {
    value: 'best' as SearchSortMode,
    label: 'Best',
    icon: ({ color }: { selected: boolean; color: string }) => (
      <Trophy size={16} strokeWidth={2.5} color={color} />
    ),
  },
  {
    value: 'rising' as SearchSortMode,
    label: 'Rising',
    icon: ({ color }: { selected: boolean; color: string }) => (
      <TrendingUp size={16} strokeWidth={2.5} color={color} />
    ),
  },
] as const;

export type SearchRankAndScoreSheetsProps = {
  isScoreInfoVisible: boolean;
  scoreInfo: ScoreInfoPayload | null;
  closeScoreInfo: () => void;
  clearScoreInfo: () => void;
  scoreInfoMaxHeight: number;
  formatCompactCount: (value: number) => string;
  isSortSelectorVisible: boolean;
  sortMode: SearchSortMode;
  onSortSelect: (mode: SearchSortMode) => void;
  closeSortSelector: () => void;
  onProfilerRender: React.ProfilerOnRenderCallback | null;
};

const SearchRankAndScoreSheets = ({
  isScoreInfoVisible,
  scoreInfo,
  closeScoreInfo,
  clearScoreInfo,
  scoreInfoMaxHeight,
  formatCompactCount,
  isSortSelectorVisible,
  sortMode,
  onSortSelect,
  closeSortSelector,
  onProfilerRender,
}: SearchRankAndScoreSheetsProps) => {
  const scoreMovementDetail = scoreInfo ? formatCraveScoreMovementDetail(scoreInfo.rising) : null;
  const sortSheet = (
    <OptionSelectorSheet
      visible={isSortSelectorVisible}
      title="Sort"
      options={SORT_OPTIONS}
      value={sortMode}
      onSelect={onSortSelect}
      onRequestClose={closeSortSelector}
      testID="search-sort-sheet"
    />
  );
  const sheet = (
    <MemoOverlayModalSheet
      visible={Boolean(isScoreInfoVisible && scoreInfo)}
      onRequestClose={closeScoreInfo}
      onDismiss={clearScoreInfo}
      paddingHorizontal={CONTENT_HORIZONTAL_PADDING}
      paddingTop={12}
      sheetStyle={{ height: scoreInfoMaxHeight }}
    >
      {scoreInfo ? (
        <View style={styles.scoreInfoContent}>
          <View style={styles.scoreInfoHeaderRow}>
            <View style={styles.scoreInfoTitleRow}>
              {scoreInfo.type === 'dish' ? (
                <HandPlatter
                  size={SECONDARY_METRIC_ICON_SIZE + 2}
                  color={themeColors.textPrimary}
                  strokeWidth={2}
                />
              ) : (
                <Store
                  size={SECONDARY_METRIC_ICON_SIZE + 2}
                  color={themeColors.textPrimary}
                  strokeWidth={2}
                />
              )}
              <Text variant="body" weight="semibold" style={styles.scoreInfoTitle}>
                {scoreInfo.type === 'dish' ? 'Dish rating' : 'Restaurant rating'}
              </Text>
              <CraveScoreText
                score={scoreInfo.score}
                detail
                variant="body"
                weight="semibold"
                style={styles.scoreInfoValue}
              />
            </View>
            <TouchableOpacity
              onPress={closeScoreInfo}
              style={styles.scoreInfoClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close rating details"
            >
              <LucideX size={18} color={themeColors.textBody} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <Text variant="body" style={styles.scoreInfoSubtitle} numberOfLines={1}>
            {scoreInfo.title}
          </Text>
          <View style={styles.scoreInfoMetricsRow}>
            <View style={styles.scoreInfoMetricItem}>
              <VoteIcon color={themeColors.textPrimary} size={14} />
              <Text variant="body" weight="medium" style={styles.scoreInfoMetricText}>
                {scoreInfo.votes == null ? '—' : formatCompactCount(scoreInfo.votes)}
              </Text>
              <Text variant="body" style={styles.scoreInfoMetricLabel}>
                Votes
              </Text>
            </View>
            <View style={styles.scoreInfoMetricItem}>
              <PollIcon color={themeColors.textPrimary} size={14} />
              <Text variant="body" weight="medium" style={styles.scoreInfoMetricText}>
                {scoreInfo.polls == null ? '—' : formatCompactCount(scoreInfo.polls)}
              </Text>
              <Text variant="body" style={styles.scoreInfoMetricLabel}>
                Polls
              </Text>
            </View>
            {scoreMovementDetail ? (
              <View style={styles.scoreInfoMetricItem}>
                <Text variant="body" weight="medium" style={styles.scoreInfoMetricText}>
                  {scoreMovementDetail}
                </Text>
                <Text variant="body" style={styles.scoreInfoMetricLabel}>
                  Trending
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.scoreInfoDivider} />
          <Text variant="body" style={styles.scoreInfoDescription}>
            {scoreInfo.type === 'dish'
              ? 'Dish rating is Crave’s stable signal, calculated from polls and votes. Your current search only changes the rank.'
              : 'Restaurant rating is Crave’s stable signal, calculated from polls and votes. Your current search only changes the rank.'}
          </Text>
        </View>
      ) : null}
    </MemoOverlayModalSheet>
  );

  return onProfilerRender ? (
    <React.Profiler id="ScoreInfoSheet" onRender={onProfilerRender}>
      {sortSheet}
      {sheet}
    </React.Profiler>
  ) : (
    <>
      {sortSheet}
      {sheet}
    </>
  );
};

export default SearchRankAndScoreSheets;
