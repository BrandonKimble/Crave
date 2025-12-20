import React from 'react';
import { Pressable, Share, TouchableOpacity, View } from 'react-native';
import type { TextLayoutEvent } from 'react-native';

import { Share as LucideShare, Heart as LucideHeart } from 'lucide-react-native';
import { HandPlatter, Store } from 'lucide-react-native';

import type { FavoriteEntityType } from '../../../services/favorites';
import { Text } from '../../../components';
import { colors as themeColors } from '../../../constants/theme';
import { getPriceRangeLabel } from '../../../constants/pricing';
import type { FoodResult, RestaurantResult } from '../../../types';
import styles from '../styles';
import { SECONDARY_METRIC_ICON_SIZE, TOP_FOOD_RENDER_LIMIT } from '../constants/search';
import { capitalizeFirst } from '../utils/format';
import { getQualityColor } from '../utils/quality';
import { calculateTopFoodVisibleCount } from '../utils/top-food';
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
  favoriteMap: Map<string, unknown>;
  toggleFavorite: (entityId: string, entityType: FavoriteEntityType) => Promise<void>;
  openRestaurantProfile: (
    restaurant: RestaurantResult,
    foodResultsOverride?: FoodResult[],
    source?: 'results_sheet' | 'auto_open_single_candidate'
  ) => void;
  openScoreInfo: (payload: ScoreInfoPayload) => void;
  primaryFoodTerm: string | null;
  topFoodInlineWidths: Record<string, number>;
  topFoodItemWidths: Record<string, Record<string, number>>;
  topFoodMoreWidths: Record<string, Record<number, number>>;
  updateTopFoodInlineWidth: (restaurantId: string, width: number) => void;
  updateTopFoodItemWidth: (restaurantId: string, connectionId: string, width: number) => void;
  updateTopFoodMoreWidth: (restaurantId: string, hiddenCount: number, width: number) => void;
};

const RestaurantResultCard: React.FC<RestaurantResultCardProps> = ({
  restaurant,
  index,
  restaurantsCount,
  favoriteMap,
  toggleFavorite,
  openRestaurantProfile,
  openScoreInfo,
  primaryFoodTerm,
  topFoodInlineWidths,
  topFoodItemWidths,
  topFoodMoreWidths,
  updateTopFoodInlineWidth,
  updateTopFoodItemWidth,
  updateTopFoodMoreWidth,
}) => {
  const isLiked = favoriteMap.has(restaurant.restaurantId);
  const qualityColor = getQualityColor(index, restaurantsCount);
  const priceRangeLabel = getPriceRangeLabel(restaurant.priceLevel);
  const topFoodItems = restaurant.topFood ?? [];
  const topFoodAverage =
    topFoodItems.length > 0
      ? topFoodItems.reduce((sum, food) => sum + (food.qualityScore ?? 0), 0) / topFoodItems.length
      : null;
  const topFoodPrimaryLabel = primaryFoodTerm ? capitalizeFirst(primaryFoodTerm.trim()) : null;
  const topFoodAvgLabel = topFoodPrimaryLabel ? 'Average dish score' : 'Average dish score';
  const maxTopFoodToRender = Math.min(topFoodItems.length, TOP_FOOD_RENDER_LIMIT);
  const topFoodInlineWidth = topFoodInlineWidths[restaurant.restaurantId];
  const topFoodItemWidthMap = topFoodItemWidths[restaurant.restaurantId];
  const topFoodMoreWidthMap = topFoodMoreWidths[restaurant.restaurantId];
  const visibleTopFoodCount =
    maxTopFoodToRender > 0
      ? Math.max(
          1,
          calculateTopFoodVisibleCount(
            topFoodItems,
            maxTopFoodToRender,
            topFoodInlineWidth,
            topFoodItemWidthMap,
            topFoodMoreWidthMap
          )
        )
      : 0;
  const inlineTopFoods = topFoodItems.slice(
    0,
    Math.max(1, Math.min(visibleTopFoodCount, maxTopFoodToRender))
  );
  const hiddenTopFoodCount = Math.max(0, topFoodItems.length - inlineTopFoods.length);
  const potentialHiddenCounts: number[] = [];
  for (let count = 1; count <= maxTopFoodToRender; count++) {
    const hidden = topFoodItems.length - count;
    if (hidden > 0) {
      potentialHiddenCounts.push(hidden);
    }
  }
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
      score: restaurant.restaurantQualityScore,
      votes: restaurant.totalUpvotes,
      polls: restaurant.mentionCount,
    });
  }, [
    openScoreInfo,
    restaurant.mentionCount,
    restaurant.restaurantName,
    restaurant.restaurantQualityScore,
    restaurant.totalUpvotes,
  ]);

  return (
    <View
      key={restaurant.restaurantId}
      style={[styles.resultItem, index === 0 && styles.firstResultItem]}
    >
      <Pressable
        style={styles.resultPressable}
        onPress={() => openRestaurantProfile(restaurant)}
        accessibilityRole="button"
        accessibilityLabel={`View ${restaurant.restaurantName}`}
      >
        <View style={styles.resultHeader}>
          <View style={styles.resultTitleContainer}>
            <View style={styles.titleRow}>
              <View style={[styles.rankBadge, { backgroundColor: qualityColor }]}>
                <Text variant="caption" style={styles.rankBadgeText}>
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
            <View style={[styles.resultContent, styles.resultContentStack]}>
              {restaurant.restaurantQualityScore !== null &&
              restaurant.restaurantQualityScore !== undefined ? (
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
                        {restaurant.restaurantQualityScore.toFixed(1)}
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
                    <View
                      style={styles.topFoodInlineList}
                      onLayout={({ nativeEvent: { layout } }) => {
                        if (layout.width > 0) {
                          updateTopFoodInlineWidth(restaurant.restaurantId, layout.width);
                        }
                      }}
                    >
                      {inlineTopFoods.map((food, idx) => (
                        <Text
                          key={food.connectionId}
                          style={styles.topFoodInlineText}
                          numberOfLines={1}
                        >
                          <Text variant="body" weight="semibold" style={styles.topFoodRankInline}>
                            {idx + 1}.
                          </Text>
                          <Text
                            variant="body"
                            weight="regular"
                            style={styles.topFoodNameInline}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {' '}
                            {food.foodName}
                          </Text>
                        </Text>
                      ))}
                      {hiddenTopFoodCount > 0 ? (
                        <Text variant="body" weight="semibold" style={styles.topFoodMore}>
                          +{hiddenTopFoodCount} more
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={styles.topFoodInlineMeasure}
                      pointerEvents="none"
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      {topFoodItems.slice(0, maxTopFoodToRender).map((food, idx) => (
                        <Text
                          key={`${food.connectionId}-measure`}
                          variant="body"
                          weight="regular"
                          style={styles.topFoodMeasureText}
                          onTextLayout={({ nativeEvent }: TextLayoutEvent) => {
                            const width = nativeEvent.lines?.[0]?.width;
                            if (typeof width === 'number') {
                              updateTopFoodItemWidth(
                                restaurant.restaurantId,
                                food.connectionId,
                                width
                              );
                            }
                          }}
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
                      {potentialHiddenCounts.map((hidden) => (
                        <Text
                          key={`${restaurant.restaurantId}-more-${hidden}`}
                          variant="body"
                          weight="semibold"
                          style={styles.topFoodMeasureText}
                          onTextLayout={({ nativeEvent }: TextLayoutEvent) => {
                            const width = nativeEvent.lines?.[0]?.width;
                            if (typeof width === 'number') {
                              updateTopFoodMoreWidth(restaurant.restaurantId, hidden, width);
                            }
                          }}
                          numberOfLines={1}
                        >
                          +{hidden} more
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
              onPress={() => toggleFavorite(restaurant.restaurantId, 'restaurant')}
              accessibilityRole="button"
              accessibilityLabel={isLiked ? 'Unlike' : 'Like'}
              style={styles.likeButton}
              hitSlop={8}
            >
              <LucideHeart
                size={20}
                color={isLiked ? themeColors.primary : '#cbd5e1'}
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
              <LucideShare size={20} color="#cbd5e1" strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </Pressable>
    </View>
  );
};

export default RestaurantResultCard;
