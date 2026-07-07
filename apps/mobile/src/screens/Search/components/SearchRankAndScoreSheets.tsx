import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { HandPlatter, Store, X as LucideX } from 'lucide-react-native';

import { Text } from '../../../components';
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

export type SearchRankAndScoreSheetsProps = {
  isScoreInfoVisible: boolean;
  scoreInfo: ScoreInfoPayload | null;
  closeScoreInfo: () => void;
  clearScoreInfo: () => void;
  scoreInfoMaxHeight: number;
  formatCompactCount: (value: number) => string;
  onProfilerRender: React.ProfilerOnRenderCallback | null;
};

const SearchRankAndScoreSheets = ({
  isScoreInfoVisible,
  scoreInfo,
  closeScoreInfo,
  clearScoreInfo,
  scoreInfoMaxHeight,
  formatCompactCount,
  onProfilerRender,
}: SearchRankAndScoreSheetsProps) => {
  const scoreMovementDetail = scoreInfo ? formatCraveScoreMovementDetail(scoreInfo.rising) : null;
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
      {sheet}
    </React.Profiler>
  ) : (
    sheet
  );
};

export default SearchRankAndScoreSheets;
