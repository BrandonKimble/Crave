import React from 'react';
import { LayoutChangeEvent, Pressable, Share, TouchableOpacity, View } from 'react-native';

import { Share as LucideShare, Heart as LucideHeart } from 'lucide-react-native';
import { HandPlatter, Store } from 'lucide-react-native';

import { Text } from '../../../components';
import { colors as themeColors } from '../../../constants/theme';
import { getPriceRangeLabel } from '../../../constants/pricing';
import type { FoodResult, RestaurantResult } from '../../../types';
import styles from '../styles';
import {
  CARD_LINE_GAP,
  SECONDARY_METRIC_ICON_SIZE,
  TOP_FOOD_RENDER_LIMIT,
} from '../constants/search';
import { capitalizeFirst, formatCoverageLabel } from '../utils/format';
import { getQualityColor } from '../utils/quality';
import { InfoCircleIcon } from './metric-icons';
import { renderMetaDetailLine } from './render-meta-detail-line';

type ScoreInfoPayload = {
  type: 'dish' | 'restaurant';
  title: string;
  score: number | null | undefined;
  votes: number | null | undefined;
  polls: number | null | undefined;
};

type RestaurantResultCardProps = {
  restaurant: RestaurantResult;
  index: number;
  restaurantsCount: number;
  isLiked: boolean;
  primaryCoverageKey?: string | null;
  showCoverageLabel?: boolean;
  onSavePress: () => void;
  openRestaurantProfile: (
    restaurant: RestaurantResult,
    foodResultsOverride?: FoodResult[],
    source?: 'results_sheet' | 'auto_open_single_candidate'
  ) => void;
  openScoreInfo: (payload: ScoreInfoPayload) => void;
  primaryFoodTerm: string | null;
};

const RestaurantResultCard: React.FC<RestaurantResultCardProps> = ({
  restaurant,
  index,
  restaurantsCount,
  isLiked,
  primaryCoverageKey = null,
  showCoverageLabel = false,
  onSavePress,
  openRestaurantProfile,
  openScoreInfo,
  primaryFoodTerm,
}) => {
  const qualityColor = getQualityColor(
    index,
    restaurantsCount,
    restaurant.displayPercentile ?? null
  );
  const priceRangeLabel = getPriceRangeLabel(restaurant.priceLevel);
  const topFoodItems = restaurant.topFood ?? [];
  const displayScoreValue = restaurant.displayScore ?? restaurant.restaurantQualityScore;
  const coverageLabel =
    showCoverageLabel && restaurant.coverageKey && restaurant.coverageKey !== primaryCoverageKey
      ? formatCoverageLabel(restaurant.coverageKey)
      : null;
  const topFoodAverage = React.useMemo(() => {
    if (topFoodItems.length === 0) {
      return null;
    }
    const total = topFoodItems.reduce((sum, food) => {
      const score = food.displayScore ?? food.qualityScore ?? 0;
      return sum + score;
    }, 0);
    return total / topFoodItems.length;
  }, [topFoodItems]);
  const topFoodPrimaryLabel = primaryFoodTerm ? capitalizeFirst(primaryFoodTerm.trim()) : null;
  const topFoodAvgLabel = topFoodPrimaryLabel ? 'Average dish score' : 'Average dish score';
  const [topFoodInlineWidth, setTopFoodInlineWidth] = React.useState(0);
  const [topFoodItemWidths, setTopFoodItemWidths] = React.useState<Record<string, number>>({});
  const [topFoodMoreWidths, setTopFoodMoreWidths] = React.useState<Record<number, number>>({});

  const maxTopFoodToRender = React.useMemo(
    () => Math.min(topFoodItems.length, TOP_FOOD_RENDER_LIMIT),
    [topFoodItems.length]
  );
  const candidateTopFoods = React.useMemo(
    () => topFoodItems.slice(0, maxTopFoodToRender),
    [maxTopFoodToRender, topFoodItems]
  );
  const topFoodMoreCounts = React.useMemo(() => {
    if (candidateTopFoods.length === 0) {
      return [];
    }
    const counts = new Set<number>();
    for (let visibleCount = 1; visibleCount <= candidateTopFoods.length; visibleCount += 1) {
      const hiddenCount = topFoodItems.length - visibleCount;
      if (hiddenCount > 0) {
        counts.add(hiddenCount);
      }
    }
    return Array.from(counts);
  }, [candidateTopFoods.length, topFoodItems.length]);
  const handleResultPressableLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setTopFoodInlineWidth((current) => (current === nextWidth ? current : nextWidth));
  }, []);
  const handleTopFoodItemLayout = React.useCallback((connectionId: string, width: number) => {
    const nextWidth = Math.round(width);
    setTopFoodItemWidths((current) => {
      if (current[connectionId] === nextWidth) {
        return current;
      }
      return {
        ...current,
        [connectionId]: nextWidth,
      };
    });
  }, []);
  const handleTopFoodMoreLayout = React.useCallback((hiddenCount: number, width: number) => {
    const nextWidth = Math.round(width);
    setTopFoodMoreWidths((current) => {
      if (current[hiddenCount] === nextWidth) {
        return current;
      }
      return {
        ...current,
        [hiddenCount]: nextWidth,
      };
    });
  }, []);
  const { visibleTopFoods, hiddenTopFoodCount } = React.useMemo(() => {
    if (candidateTopFoods.length === 0) {
      return { visibleTopFoods: candidateTopFoods, hiddenTopFoodCount: 0 };
    }
    if (!topFoodInlineWidth) {
      return {
        visibleTopFoods: candidateTopFoods,
        hiddenTopFoodCount: Math.max(0, topFoodItems.length - candidateTopFoods.length),
      };
    }
    const measuredWidths = candidateTopFoods.map((food) => topFoodItemWidths[food.connectionId]);
    if (measuredWidths.some((width) => width === undefined)) {
      return {
        visibleTopFoods: candidateTopFoods,
        hiddenTopFoodCount: Math.max(0, topFoodItems.length - candidateTopFoods.length),
      };
    }

    let visibleCount = 0;
    let usedWidth = 0;

    for (let i = 0; i < candidateTopFoods.length; i += 1) {
      const itemWidth = measuredWidths[i] ?? 0;
      const nextWidth = visibleCount === 0 ? itemWidth : usedWidth + CARD_LINE_GAP + itemWidth;
      const remainingCount = topFoodItems.length - (i + 1);
      const needsMore = remainingCount > 0;
      const moreWidth = needsMore ? topFoodMoreWidths[remainingCount] ?? 0 : 0;
      const reservedMore = needsMore ? moreWidth + CARD_LINE_GAP : 0;
      if (nextWidth + reservedMore <= topFoodInlineWidth) {
        visibleCount = i + 1;
        usedWidth = nextWidth;
      } else {
        break;
      }
    }

    const clampedVisibleCount = Math.min(Math.max(1, visibleCount), candidateTopFoods.length);

    return {
      visibleTopFoods: candidateTopFoods.slice(0, clampedVisibleCount),
      hiddenTopFoodCount: Math.max(0, topFoodItems.length - clampedVisibleCount),
    };
  }, [
    candidateTopFoods,
    topFoodInlineWidth,
    topFoodItemWidths,
    topFoodMoreWidths,
    topFoodItems.length,
  ]);
  const restaurantMetaLine = renderMetaDetailLine(
    restaurant.operatingStatus,
    null,
    restaurant.distanceMiles,
    'left',
    undefined,
    true,
    true
  );

  const handleShare = React.useCallback(() => {
    void Share.share({
      message: `${restaurant.restaurantName} · View on Crave Search`,
    }).catch(() => undefined);
  }, [restaurant.restaurantName]);

  const handleRestaurantInfoPress = React.useCallback(() => {
    openScoreInfo({
      type: 'restaurant',
      title: restaurant.restaurantName,
      score: displayScoreValue,
      votes: restaurant.totalUpvotes,
      polls: restaurant.mentionCount,
    });
  }, [
    openScoreInfo,
    restaurant.mentionCount,
    restaurant.restaurantName,
    restaurant.totalUpvotes,
    displayScoreValue,
  ]);

  return (
    <View
      key={restaurant.restaurantId}
      style={[styles.resultItem, index === 0 && styles.firstResultItem]}
    >
      <Pressable
        style={styles.resultPressable}
        onPress={() => openRestaurantProfile(restaurant)}
        onLayout={handleResultPressableLayout}
        accessibilityRole="button"
        accessibilityLabel={`View ${restaurant.restaurantName}`}
      >
        <View style={styles.resultHeader}>
          <View style={styles.resultTitleContainer}>
            <View style={styles.titleRow}>
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
                {restaurant.restaurantName}
              </Text>
            </View>
            {restaurantMetaLine ? (
              <View
                style={[styles.resultMetaLine, index === 0 && styles.resultMetaLineFirstInList]}
              >
                {restaurantMetaLine}
              </View>
            ) : null}
            {coverageLabel ? (
              <View style={styles.coverageBadge}>
                <Text variant="body" style={styles.coverageBadgeText}>
                  {coverageLabel}
                </Text>
              </View>
            ) : null}
            <View style={[styles.resultContent, styles.resultContentStack]}>
              {displayScoreValue !== null && displayScoreValue !== undefined ? (
                <View style={styles.metricBlock}>
                  <View style={[styles.restaurantMetricRow, styles.metricSupportRow]}>
                    <View style={styles.restaurantMetricLeft}>
                      <Store
                        size={SECONDARY_METRIC_ICON_SIZE}
                        color={themeColors.primary}
                        strokeWidth={2}
                        style={[styles.metricIcon, styles.restaurantScoreIcon]}
                      />
                      <Text variant="body" weight="semibold" style={styles.metricValue}>
                        {displayScoreValue != null ? displayScoreValue.toFixed(1) : '—'}
                      </Text>
                      <Text
                        variant="body"
                        weight="regular"
                        style={[styles.metricSupportLabel, styles.restaurantMetricLabel]}
                        numberOfLines={1}
                      >
                        Restaurant score
                      </Text>
                      <TouchableOpacity
                        onPress={handleRestaurantInfoPress}
                        style={styles.scoreInfoIconButton}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="How restaurant scores are calculated"
                      >
                        <InfoCircleIcon
                          size={SECONDARY_METRIC_ICON_SIZE + 2}
                          color={themeColors.secondaryAccent}
                          strokeWidth={2}
                        />
                      </TouchableOpacity>
                    </View>
                    {priceRangeLabel ? (
                      <View style={styles.restaurantMetricRight}>
                        <Text variant="body" style={styles.metricDot}>
                          {'·'}
                        </Text>
                        <Text variant="body" style={styles.resultMetaPrice} numberOfLines={1}>
                          {priceRangeLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}
              {topFoodItems.length ? (
                <View style={styles.topFoodSection}>
                  <View style={styles.topFoodHeader}>
                    <View style={styles.topFoodAvgRow}>
                      <HandPlatter
                        size={SECONDARY_METRIC_ICON_SIZE}
                        color={themeColors.primary}
                        strokeWidth={2}
                        style={styles.metricIcon}
                      />
                      {topFoodAverage !== null ? (
                        <Text variant="body" weight="medium" style={styles.topFoodScorePrimary}>
                          {topFoodAverage.toFixed(1)}
                        </Text>
                      ) : null}
                      {topFoodPrimaryLabel ? (
                        <Text variant="body" weight="regular" style={styles.topFoodLabel}>
                          <Text variant="body" weight="regular" style={styles.topFoodLabel}>
                            Average{' '}
                          </Text>
                          <Text variant="body" weight="semibold" style={styles.topFoodLabelStrong}>
                            {topFoodPrimaryLabel}
                          </Text>
                          <Text variant="body" weight="regular" style={styles.topFoodLabel}>
                            {' '}
                            score
                          </Text>
                        </Text>
                      ) : (
                        <Text variant="body" weight="regular" style={styles.topFoodLabel}>
                          {topFoodAvgLabel}
                        </Text>
                      )}
                    </View>
                    <View style={styles.topFoodDivider} />
                  </View>
                  <View style={styles.topFoodInlineRow}>
                    <View style={styles.topFoodInlineList}>
                      {visibleTopFoods.map((food, idx) => (
                        <Text
                          key={food.connectionId}
                          style={styles.topFoodInlineText}
                          numberOfLines={1}
                        >
                          <Text variant="body" weight="semibold" style={styles.topFoodRankInline}>
                            {idx + 1}.
                          </Text>
                          <Text variant="body" weight="regular" style={styles.topFoodNameInline}>
                            {' '}
                            {food.foodName}
                          </Text>
                        </Text>
                      ))}
                      {hiddenTopFoodCount > 0 ? (
                        <Text
                          variant="body"
                          weight="semibold"
                          style={styles.topFoodMore}
                          numberOfLines={1}
                        >
                          +{hiddenTopFoodCount} more
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.topFoodInlineMeasure}>
                      {candidateTopFoods.map((food, idx) => (
                        <Text
                          key={`${food.connectionId}-measure`}
                          style={styles.topFoodInlineText}
                          numberOfLines={1}
                          onLayout={({ nativeEvent }) =>
                            handleTopFoodItemLayout(food.connectionId, nativeEvent.layout.width)
                          }
                        >
                          <Text variant="body" weight="semibold" style={styles.topFoodRankInline}>
                            {idx + 1}.
                          </Text>
                          <Text variant="body" weight="regular" style={styles.topFoodNameInline}>
                            {' '}
                            {food.foodName}
                          </Text>
                        </Text>
                      ))}
                      {topFoodMoreCounts.map((count) => (
                        <Text
                          key={`top-food-more-${count}`}
                          variant="body"
                          weight="semibold"
                          style={styles.topFoodMore}
                          numberOfLines={1}
                          onLayout={({ nativeEvent }) =>
                            handleTopFoodMoreLayout(count, nativeEvent.layout.width)
                          }
                        >
                          +{count} more
                        </Text>
                      ))}
                    </View>
                  </View>
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

export default React.memo(RestaurantResultCard);
