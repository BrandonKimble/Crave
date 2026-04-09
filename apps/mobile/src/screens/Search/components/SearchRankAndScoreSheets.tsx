import React from 'react';
import { Pressable, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Building2, Earth, HandPlatter, Store, X as LucideX } from 'lucide-react-native';

import { Text } from '../../../components';
import type { OverlayModalSheetHandle } from '../../../overlays/OverlayModalSheet';
import OverlayModalSheet from '../../../overlays/OverlayModalSheet';
import { OVERLAY_HORIZONTAL_PADDING } from '../../../overlays/overlaySheetStyles';
import { colors as themeColors } from '../../../constants/theme';
import { CONTENT_HORIZONTAL_PADDING, SECONDARY_METRIC_ICON_SIZE } from '../constants/search';
import { PollIcon, VoteIcon } from './metric-icons';
import styles from '../styles';

type RankMode = 'coverage_display' | 'global_quality';

export type ScoreInfoPayload = {
  type: 'dish' | 'restaurant';
  title: string;
  score: number | null | undefined;
  votes: number | null | undefined;
  polls: number | null | undefined;
};

const RANK_MODE_OPTIONS: ReadonlyArray<{ value: RankMode; label: string }> = [
  { value: 'coverage_display', label: 'Local' },
  { value: 'global_quality', label: 'Global' },
];

const MemoOverlayModalSheet = React.memo(
  OverlayModalSheet,
  (prev, next) => !prev.visible && !next.visible
);

export type SearchRankAndScoreSheetsProps = {
  rankSheetRef: React.RefObject<OverlayModalSheetHandle | null>;
  isRankSelectorVisible: boolean;
  closeRankSelector: () => void;
  dismissRankSelector: () => void;
  pendingScoreMode: RankMode;
  setPendingScoreMode: React.Dispatch<React.SetStateAction<RankMode>>;
  handleRankDone: () => void;
  activeTabColor: string;
  activeTabColorDark: string;
  isScoreInfoVisible: boolean;
  scoreInfo: ScoreInfoPayload | null;
  closeScoreInfo: () => void;
  clearScoreInfo: () => void;
  scoreInfoMaxHeight: number;
  formatCompactCount: (value: number) => string;
  onProfilerRender: React.ProfilerOnRenderCallback;
};

const SearchRankAndScoreSheets = ({
  rankSheetRef,
  isRankSelectorVisible,
  closeRankSelector,
  dismissRankSelector,
  pendingScoreMode,
  setPendingScoreMode,
  handleRankDone,
  activeTabColor,
  activeTabColorDark,
  isScoreInfoVisible,
  scoreInfo,
  closeScoreInfo,
  clearScoreInfo,
  scoreInfoMaxHeight,
  formatCompactCount,
  onProfilerRender,
}: SearchRankAndScoreSheetsProps) => {
  return (
    <>
      <React.Profiler id="RankSheet" onRender={onProfilerRender}>
        <MemoOverlayModalSheet
          ref={rankSheetRef}
          visible={isRankSelectorVisible}
          onRequestClose={closeRankSelector}
          maxBackdropOpacity={0.42}
          paddingHorizontal={OVERLAY_HORIZONTAL_PADDING}
          paddingTop={12}
        >
          <View style={styles.rankSheetHeaderRow}>
            <Text variant="subtitle" weight="semibold" style={styles.rankSheetHeadline}>
              Rank
            </Text>
          </View>
          <View style={styles.rankSheetOptions}>
            {RANK_MODE_OPTIONS.map((option, index) => {
              const selected = pendingScoreMode === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setPendingScoreMode(option.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${option.label.toLowerCase()} ranking`}
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.rankSheetOption,
                    index === 0 && { marginRight: 10 },
                    selected && styles.rankSheetOptionSelected,
                    pressed && { opacity: 0.92 },
                  ]}
                >
                  {selected ? (
                    <LinearGradient
                      pointerEvents="none"
                      colors={[
                        `${themeColors.primary}1f`,
                        `${themeColors.primary}0a`,
                        'transparent',
                      ]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        right: 0,
                        borderRadius: 12,
                      }}
                    />
                  ) : null}
                  {option.value === 'coverage_display' ? (
                    <Building2
                      size={16}
                      strokeWidth={2.5}
                      color={selected ? themeColors.primary : themeColors.textPrimary}
                    />
                  ) : (
                    <Earth
                      size={16}
                      strokeWidth={2.5}
                      color={selected ? themeColors.primary : themeColors.textPrimary}
                    />
                  )}
                  <Text
                    variant="body"
                    weight="semibold"
                    style={[
                      styles.rankSheetOptionText,
                      selected && styles.rankSheetOptionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.sheetActionsRow}>
            <Pressable
              onPress={dismissRankSelector}
              accessibilityRole="button"
              accessibilityLabel="Cancel rank mode changes"
              style={styles.sheetCancelButton}
            >
              <Text
                variant="caption"
                weight="semibold"
                style={[styles.sheetCancelText, { color: activeTabColorDark }]}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleRankDone}
              accessibilityRole="button"
              accessibilityLabel="Apply rank mode"
              style={[styles.priceSheetDoneButton, { backgroundColor: activeTabColor }]}
            >
              <Text variant="caption" weight="semibold" style={styles.priceSheetDoneText}>
                Done
              </Text>
            </Pressable>
          </View>
        </MemoOverlayModalSheet>
      </React.Profiler>
      <React.Profiler id="ScoreInfoSheet" onRender={onProfilerRender}>
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
                    {scoreInfo.type === 'dish' ? 'Dish score' : 'Restaurant score'}
                  </Text>
                  <Text variant="body" weight="semibold" style={styles.scoreInfoValue}>
                    {scoreInfo.score != null ? scoreInfo.score.toFixed(1) : '—'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={closeScoreInfo}
                  style={styles.scoreInfoClose}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close score details"
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
              </View>
              <View style={styles.scoreInfoDivider} />
              <Text variant="body" style={styles.scoreInfoDescription}>
                {scoreInfo.type === 'dish'
                  ? 'Dish score is a rank-based 0–100 index within this city. It reflects mention and upvote signals (time-decayed) plus restaurant context. 100 is the top dish in this coverage area.'
                  : 'Restaurant score is a rank-based 0–100 index within this city. It reflects the strength of its best dishes, overall menu consistency, and general praise. 100 is the top restaurant in this coverage area.'}
              </Text>
            </View>
          ) : null}
        </MemoOverlayModalSheet>
      </React.Profiler>
    </>
  );
};

export default SearchRankAndScoreSheets;
