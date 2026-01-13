import React from 'react';
import { Pressable, Share, TouchableOpacity, View } from 'react-native';

import { Share as LucideShare, Heart as LucideHeart } from 'lucide-react-native';
import { HandPlatter } from 'lucide-react-native';

import { Text } from '../../../components';
import { colors as themeColors } from '../../../constants/theme';
import { getPriceRangeLabel } from '../../../constants/pricing';
import type { FoodResult, RestaurantResult } from '../../../types';
import styles from '../styles';
import { SECONDARY_METRIC_ICON_SIZE } from '../constants/search';
import { InfoCircleIcon } from './metric-icons';
import { renderMetaDetailLine } from './render-meta-detail-line';
import { resolveCoverageDisplayLabel } from '../utils/format';
import { searchService } from '../../../services/search';
import { useSearchHistoryStore } from '../../../store/searchHistoryStore';

type ScoreInfoPayload = {
  type: 'dish' | 'restaurant';
  title: string;
  score: number | null | undefined;
  votes: number | null | undefined;
  polls: number | null | undefined;
};

type DishResultCardProps = {
  item: FoodResult;
  index: number;
  qualityColor: string;
  isLiked: boolean;
  primaryCoverageKey?: string | null;
  showCoverageLabel?: boolean;
  restaurantForDish?: RestaurantResult;
  onSavePress: () => void;
  openRestaurantProfile: (
    restaurant: RestaurantResult,
    foodResultsOverride?: FoodResult[],
    source?: 'results_sheet' | 'auto_open_single_candidate' | 'dish_card'
  ) => void;
  openScoreInfo: (payload: ScoreInfoPayload) => void;
};

const DishResultCard: React.FC<DishResultCardProps> = ({
  item,
  index,
  qualityColor,
  isLiked,
  primaryCoverageKey = null,
  showCoverageLabel = false,
  restaurantForDish,
  onSavePress,
  openRestaurantProfile,
  openScoreInfo,
}) => {
  const trackRecentlyViewedFood = useSearchHistoryStore((state) => state.trackRecentlyViewedFood);
  const dishPriceLabel = getPriceRangeLabel(item.restaurantPriceLevel);
  const hasStatus = Boolean(item.restaurantOperatingStatus);
  const dishMetaPrimaryLine = renderMetaDetailLine(
    null,
    dishPriceLabel,
    hasStatus ? null : item.restaurantDistanceMiles,
    'left',
    item.restaurantName,
    true
  );
  const dishStatusLine = renderMetaDetailLine(
    item.restaurantOperatingStatus,
    null,
    hasStatus ? item.restaurantDistanceMiles : null,
    'left',
    undefined,
    true,
    true
  );
  const displayScoreValue = item.displayScore ?? item.qualityScore;
  const coverageLabel =
    showCoverageLabel && item.coverageKey && item.coverageKey !== primaryCoverageKey
      ? resolveCoverageDisplayLabel(item.coverageName, item.coverageKey)
      : null;

  const handleShare = React.useCallback(() => {
    void Share.share({
      message: `${item.foodName} at ${item.restaurantName} · View on Crave Search`,
    }).catch(() => undefined);
  }, [item.foodName, item.restaurantName]);

  const handleDishPress = React.useCallback(() => {
    if (!restaurantForDish) {
      return;
    }

    void searchService
      .recordFoodView({
        connectionId: item.connectionId,
        foodId: item.foodId,
        source: 'results_sheet',
      })
      .catch(() => undefined);

    trackRecentlyViewedFood({
      connectionId: item.connectionId,
      foodId: item.foodId,
      foodName: item.foodName,
      restaurantId: restaurantForDish.restaurantId,
      restaurantName: restaurantForDish.restaurantName,
      statusPreview: {
        restaurantId: restaurantForDish.restaurantId,
        operatingStatus: item.restaurantOperatingStatus ?? null,
        distanceMiles: item.restaurantDistanceMiles ?? null,
        locationCount: null,
      },
    });

    openRestaurantProfile(restaurantForDish, undefined, 'dish_card');
  }, [
    item.connectionId,
    item.foodId,
    item.foodName,
    item.restaurantDistanceMiles,
    item.restaurantOperatingStatus,
    openRestaurantProfile,
    restaurantForDish,
    trackRecentlyViewedFood,
  ]);

  const handleDishInfoPress = React.useCallback(() => {
    openScoreInfo({
      type: 'dish',
      title: item.foodName,
      score: displayScoreValue,
      votes: item.totalUpvotes,
      polls: item.mentionCount,
    });
  }, [item.foodName, item.mentionCount, item.totalUpvotes, displayScoreValue, openScoreInfo]);

  return (
    <View
      key={item.connectionId}
      style={[styles.resultItem, index === 0 && styles.firstResultItem]}
    >
      <Pressable
        style={styles.resultPressable}
        onPress={handleDishPress}
        accessibilityRole={restaurantForDish ? 'button' : undefined}
        accessibilityLabel={restaurantForDish ? `View ${item.restaurantName}` : undefined}
        disabled={!restaurantForDish}
      >
        <View style={styles.resultHeader}>
          <View style={styles.resultTitleContainer}>
            <View style={[styles.titleRow, styles.titleRowWithActions]}>
              <View style={[styles.rankBadge, { backgroundColor: qualityColor }]}>
                <Text variant="body" style={styles.rankBadgeText}>
                  {index + 1}
                </Text>
              </View>
              <Text
                variant="subtitle"
                weight="semibold"
                style={styles.textSlate900}
                numberOfLines={1}
              >
                {item.foodName}
              </Text>
            </View>
            <View style={styles.cardBodyStack}>
              <View style={styles.metricBlock}>
                <View style={styles.metricLine}>
                  <HandPlatter
                    size={SECONDARY_METRIC_ICON_SIZE}
                    color={themeColors.primary}
                    strokeWidth={2}
                    style={styles.metricIcon}
                  />
                  <Text variant="body" weight="semibold" style={styles.metricValue}>
                    {displayScoreValue != null ? displayScoreValue.toFixed(1) : '—'}
                  </Text>
                  <Text variant="body" weight="regular" style={styles.metricLabel}>
                    Dish score
                  </Text>
                  <TouchableOpacity
                    onPress={handleDishInfoPress}
                    style={styles.scoreInfoIconButton}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="How dish scores are calculated"
                  >
                    <InfoCircleIcon
                      size={SECONDARY_METRIC_ICON_SIZE + 2}
                      color={themeColors.secondaryAccent}
                      strokeWidth={2}
                    />
                  </TouchableOpacity>
                </View>
              </View>
              {dishMetaPrimaryLine ? (
                <View style={styles.resultMetaLine}>{dishMetaPrimaryLine}</View>
              ) : null}
              {dishStatusLine ? (
                <View style={[styles.resultMetaLine, styles.dishMetaLineFirst]}>
                  {dishStatusLine}
                </View>
              ) : null}
              {coverageLabel ? (
                <View style={styles.coverageBadge}>
                  <Text variant="body" style={styles.coverageBadgeText}>
                    {coverageLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.resultActions}>
            <Pressable
              onPress={onSavePress}
              accessibilityRole="button"
              accessibilityLabel={isLiked ? 'Unlike' : 'Like'}
              style={styles.likeButton}
              hitSlop={8}
            >
              <LucideHeart
                size={20}
                color={isLiked ? themeColors.primary : themeColors.textBody}
                fill={isLiked ? themeColors.primary : 'none'}
                strokeWidth={2}
              />
            </Pressable>
            <Pressable
              onPress={handleShare}
              accessibilityRole="button"
              accessibilityLabel="Share"
              style={styles.shareButton}
              hitSlop={8}
            >
              <LucideShare size={20} color={themeColors.textBody} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </Pressable>
    </View>
  );
};

export default React.memo(DishResultCard);
