import React from 'react';
import { Pressable, Share, TouchableOpacity, View, useWindowDimensions } from 'react-native';

import { Share as LucideShare, Heart as LucideHeart } from 'lucide-react-native';
import { HandPlatter, Store } from 'lucide-react-native';

import { Text } from '../../../components';
import { colors as themeColors } from '../../../constants/theme';
import { getPriceRangeLabel } from '../../../constants/pricing';
import type { FoodResult, RestaurantResult } from '../../../types';
import styles from '../styles';
import {
  CARD_LINE_GAP,
  CONTENT_HORIZONTAL_PADDING,
  RESULT_DETAILS_INDENT,
  SECONDARY_METRIC_ICON_SIZE,
  TOP_FOOD_RENDER_LIMIT,
} from '../constants/search';
import { capitalizeFirst, formatCoverageLabel, formatDistanceMiles } from '../utils/format';
import { getQualityColor } from '../utils/quality';
import { InfoCircleIcon } from './metric-icons';
import { renderMetaDetailLine } from './render-meta-detail-line';
import { useTopFoodMeasurement } from '../hooks/use-top-food-measurement';
import { useSearchInteraction } from '../context/SearchInteractionContext';
import searchPerfDebug from '../search-perf-debug';

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
  // Read interaction state from a ref to avoid re-rendering on drag changes
  const { interactionRef } = useSearchInteraction();
  const isInteracting = interactionRef.current.isInteracting;
  const disableTopFoodMeasurement =
    searchPerfDebug.enabled && searchPerfDebug.disableTopFoodMeasurement;

  const qualityColor = getQualityColor(
    index,
    restaurantsCount,
    restaurant.displayPercentile ?? null
  );
  const priceRangeLabel = getPriceRangeLabel(restaurant.priceLevel);
  const hasStatus =
    restaurant.operatingStatus?.isOpen === true || restaurant.operatingStatus?.isOpen === false;
  const distanceLabel = formatDistanceMiles(restaurant.distanceMiles);
  const showDistanceInScore = !hasStatus && distanceLabel !== null;
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
  const { width: windowWidth } = useWindowDimensions();
  const topFoodInlineWidth = React.useMemo(() => {
    const horizontalPadding = CONTENT_HORIZONTAL_PADDING * 2;
    const baseWidth = windowWidth - horizontalPadding;
    return Math.max(0, baseWidth - RESULT_DETAILS_INDENT);
  }, [windowWidth, CONTENT_HORIZONTAL_PADDING, RESULT_DETAILS_INDENT]);

  // Use the optimized layout measurement hook
  // This debounces measurements and skips them during drag/scroll
  const {
    visibleTopFoods,
    hiddenTopFoodCount,
    onItemLayout,
    onMoreLayout,
    hasMeasured,
    candidateTopFoods,
    topFoodMoreCounts,
  } = useTopFoodMeasurement({
    topFoodItems,
    maxToRender: TOP_FOOD_RENDER_LIMIT,
    availableWidth: topFoodInlineWidth,
    itemGap: CARD_LINE_GAP,
    isDraggingRef: interactionRef,
    enabled: !disableTopFoodMeasurement,
    debounceMs: 50,
  });
  const topFoodSignature = React.useMemo(
    () => `${topFoodItems.length}:${candidateTopFoods.map((food) => food.connectionId).join('|')}`,
    [candidateTopFoods, topFoodItems.length]
  );
  const measuredCacheRef = React.useRef<{
    signature: string;
    foods: typeof visibleTopFoods;
    hiddenCount: number;
  } | null>(null);
  React.useEffect(() => {
    if (interactionRef.current.isInteracting || !hasMeasured) {
      return;
    }
    measuredCacheRef.current = {
      signature: topFoodSignature,
      foods: visibleTopFoods,
      hiddenCount: hiddenTopFoodCount,
    };
  }, [hasMeasured, hiddenTopFoodCount, interactionRef, topFoodSignature, visibleTopFoods]);
  const fastVisibleTopFoods = React.useMemo(
    () => topFoodItems.slice(0, Math.min(2, TOP_FOOD_RENDER_LIMIT)),
    [topFoodItems]
  );
  const fastHiddenTopFoodCount = Math.max(0, topFoodItems.length - fastVisibleTopFoods.length);
  const cachedTopFoods = measuredCacheRef.current;
  const useCachedTopFoods = isInteracting && cachedTopFoods?.signature === topFoodSignature;
  const effectiveTopFoods = useCachedTopFoods
    ? cachedTopFoods.foods
    : isInteracting && !hasMeasured
    ? fastVisibleTopFoods
    : visibleTopFoods;
  const effectiveHiddenTopFoodCount = useCachedTopFoods
    ? cachedTopFoods.hiddenCount
    : isInteracting && !hasMeasured
    ? fastHiddenTopFoodCount
    : hiddenTopFoodCount;
  const showDishCountLabel =
    topFoodItems.length > 0 &&
    effectiveTopFoods.length === 0 &&
    effectiveHiddenTopFoodCount === topFoodItems.length;
  const dishCountLabel = topFoodItems.length === 1 ? '1 dish' : `${topFoodItems.length} dishes`;
  const shouldRenderMeasurements = !isInteracting && !hasMeasured;

  const restaurantStatusLine = renderMetaDetailLine(
    hasStatus ? restaurant.operatingStatus : null,
    null,
    hasStatus ? restaurant.distanceMiles : null,
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

  const handleRestaurantPress = React.useCallback(() => {
    openRestaurantProfile(restaurant);
  }, [openRestaurantProfile, restaurant]);

  return (
    <View
      key={restaurant.restaurantId}
      style={[styles.resultItem, index === 0 && styles.firstResultItem]}
    >
      <Pressable
        style={styles.resultPressable}
        onPress={handleRestaurantPress}
        accessibilityRole="button"
        accessibilityLabel={`View ${restaurant.restaurantName}`}
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
                {restaurant.restaurantName}
              </Text>
            </View>
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
                    {priceRangeLabel || showDistanceInScore ? (
                      <View style={styles.restaurantMetricRight}>
                        {priceRangeLabel ? (
                          <>
                            <Text variant="body" style={styles.metricDot}>
                              {'·'}
                            </Text>
                            <Text variant="body" style={styles.resultMetaPrice} numberOfLines={1}>
                              {priceRangeLabel}
                            </Text>
                          </>
                        ) : null}
                        {showDistanceInScore ? (
                          <>
                            <Text variant="body" style={styles.metricDot}>
                              {'·'}
                            </Text>
                            <Text
                              variant="body"
                              style={styles.resultMetaDistance}
                              numberOfLines={1}
                            >
                              {distanceLabel ?? ''}
                            </Text>
                          </>
                        ) : null}
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
                  <View style={[styles.topFoodInlineRow, { width: topFoodInlineWidth }]}>
                    <View style={styles.topFoodInlineList}>
                      {effectiveTopFoods.map((food, idx) => (
                        <Text key={food.connectionId} style={styles.topFoodInlineText}>
                          <Text variant="body" weight="semibold" style={styles.topFoodRankInline}>
                            {idx + 1}.
                          </Text>
                          <Text variant="body" weight="regular" style={styles.topFoodNameInline}>
                            {' '}
                            {food.foodName}
                          </Text>
                        </Text>
                      ))}
                      {showDishCountLabel ? (
                        <Text variant="body" weight="semibold" style={styles.topFoodMore}>
                          {dishCountLabel}
                        </Text>
                      ) : effectiveHiddenTopFoodCount > 0 ? (
                        <Text variant="body" weight="semibold" style={styles.topFoodMore}>
                          +{effectiveHiddenTopFoodCount} more
                        </Text>
                      ) : null}
                    </View>
                    {shouldRenderMeasurements ? (
                      <View style={styles.topFoodInlineMeasure}>
                        {candidateTopFoods.map((food, idx) => (
                          <Text
                            key={`${food.connectionId}-measure`}
                            style={styles.topFoodInlineText}
                            numberOfLines={1}
                            onLayout={onItemLayout(food.connectionId)}
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
                            onLayout={onMoreLayout(count)}
                          >
                            +{count} more
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}
              {restaurantStatusLine ? (
                <View style={styles.resultMetaLine}>{restaurantStatusLine}</View>
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
