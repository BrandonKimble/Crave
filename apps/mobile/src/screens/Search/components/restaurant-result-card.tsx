import React from 'react';
import { type LayoutChangeEvent, Pressable, Share, TouchableOpacity, View } from 'react-native';

import { Share as LucideShare, Heart as LucideHeart } from 'lucide-react-native';
import { Store } from 'lucide-react-native';

import { Text } from '../../../components';
import { colors as themeColors } from '../../../constants/theme';
import { getPriceRangeLabel } from '../../../constants/pricing';
import type { FoodResult, RestaurantResult } from '../../../types';
import { useSearchInteraction } from '../context/SearchInteractionContext';
import { useTopFoodMeasurement } from '../hooks/use-top-food-measurement';
import styles from '../styles';
import { SECONDARY_METRIC_ICON_SIZE, TOP_FOOD_RENDER_LIMIT } from '../constants/search';
import { formatDistanceMiles, resolveCoverageDisplayLabel } from '../utils/format';
import { InfoCircleIcon } from './metric-icons';
import { renderMetaDetailLine } from './render-meta-detail-line';

const TOP_FOOD_INLINE_GAP = '\u2006\u2006\u2006\u2006';
const TOP_FOOD_MEASUREMENT_ITEM_GAP_PX = 0;

const STORE_ICON = (
  <Store
    size={SECONDARY_METRIC_ICON_SIZE}
    color={themeColors.primary}
    strokeWidth={2}
    style={[styles.metricIcon, styles.restaurantScoreIcon]}
  />
);

const INFO_CIRCLE_ICON_RESTAURANT = (
  <InfoCircleIcon
    size={SECONDARY_METRIC_ICON_SIZE + 2}
    color={themeColors.secondaryAccent}
    strokeWidth={2}
  />
);

const SHARE_ICON = <LucideShare size={20} color={themeColors.textBody} strokeWidth={2} />;

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
  rank: number;
  qualityColor: string;
  isLiked: boolean;
  scoreMode?: 'global_quality' | 'coverage_display';
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
  rank,
  qualityColor,
  isLiked,
  scoreMode = 'global_quality',
  primaryCoverageKey = null,
  showCoverageLabel = false,
  onSavePress,
  openRestaurantProfile,
  openScoreInfo,
  primaryFoodTerm: _primaryFoodTerm,
}) => {
  const primaryFoodTerm = React.useMemo(() => {
    if (typeof _primaryFoodTerm !== 'string') {
      return null;
    }
    const trimmed = _primaryFoodTerm.trim();
    return trimmed.length ? trimmed : null;
  }, [_primaryFoodTerm]);
  const primaryFoodSingleWord = React.useMemo(() => {
    return Boolean(primaryFoodTerm && !/\s/u.test(primaryFoodTerm));
  }, [primaryFoodTerm]);

  const priceRangeLabel = getPriceRangeLabel(restaurant.priceLevel);
  const hasStatus =
    restaurant.operatingStatus?.isOpen === true || restaurant.operatingStatus?.isOpen === false;
  const distanceLabel = formatDistanceMiles(restaurant.distanceMiles);
  const showDistanceInScore = !hasStatus && distanceLabel !== null;
  const topFoodItems = restaurant.topFood ?? [];
  const totalDishCount = Math.max(
    restaurant.totalDishCount ?? topFoodItems.length,
    topFoodItems.length
  );
  const displayScoreValue = React.useMemo(() => {
    if (scoreMode === 'coverage_display') {
      if (typeof restaurant.displayScore === 'number' && Number.isFinite(restaurant.displayScore)) {
        return restaurant.displayScore;
      }
      return null;
    }
    if (
      typeof restaurant.restaurantQualityScore === 'number' &&
      Number.isFinite(restaurant.restaurantQualityScore)
    ) {
      return restaurant.restaurantQualityScore;
    }
    return null;
  }, [restaurant.displayScore, restaurant.restaurantQualityScore, scoreMode]);
  const coverageLabel =
    showCoverageLabel && restaurant.coverageKey && restaurant.coverageKey !== primaryCoverageKey
      ? resolveCoverageDisplayLabel(restaurant.coverageName, restaurant.coverageKey)
      : null;

  const { interactionRef } = useSearchInteraction();
  const candidateTopFoods = React.useMemo(
    () => topFoodItems.slice(0, TOP_FOOD_RENDER_LIMIT),
    [topFoodItems]
  );
  const dishCountLabel = totalDishCount === 1 ? '1 dish' : `${totalDishCount} dishes`;
  const [topFoodLineWidth, setTopFoodLineWidth] = React.useState<number | null>(null);
  const handleTopFoodLineLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setTopFoodLineWidth((prev) => {
      if (prev === null || Math.abs(prev - nextWidth) >= 1) {
        return nextWidth;
      }
      return prev;
    });
  }, []);
  const {
    visibleTopFoods,
    hiddenTopFoodCount,
    onItemLayout,
    onMoreLayout,
    hasMeasured,
    candidateTopFoods: measuredCandidateTopFoods,
    topFoodMoreCounts,
    allCached,
  } = useTopFoodMeasurement({
    topFoodItems: candidateTopFoods,
    totalTopFoodCount: totalDishCount,
    maxToRender: TOP_FOOD_RENDER_LIMIT,
    availableWidth: topFoodLineWidth ?? undefined,
    itemGap: TOP_FOOD_MEASUREMENT_ITEM_GAP_PX,
    enabled: true,
    isDraggingRef: interactionRef as React.RefObject<{ isInteracting: boolean }>,
  });

  const renderHighlightedFoodName = React.useCallback(
    (foodName: string): React.ReactNode => {
      if (!primaryFoodSingleWord || !primaryFoodTerm) {
        return foodName;
      }

      if (primaryFoodTerm.length < 3) {
        return foodName;
      }

      const termLower = primaryFoodTerm.toLowerCase();
      const nameLower = foodName.toLowerCase();
      const isWordChar = (char: string | undefined) => {
        if (!char) return false;
        return /[A-Za-z0-9]/.test(char);
      };

      const matchIndex = nameLower.indexOf(termLower);
      if (matchIndex < 0) {
        return foodName;
      }

      const matchStart = matchIndex;
      const matchEnd = matchIndex + primaryFoodTerm.length;

      let wordStart = matchStart;
      let wordEnd = matchEnd;
      while (wordStart > 0 && isWordChar(foodName[wordStart - 1])) {
        wordStart -= 1;
      }
      while (wordEnd < foodName.length && isWordChar(foodName[wordEnd])) {
        wordEnd += 1;
      }

      const isPrefixMatch = matchStart === wordStart;
      const isSuffixMatch = matchEnd === wordEnd;
      const word = foodName.slice(wordStart, wordEnd);

      let highlightStart = matchStart;
      let highlightEnd = matchEnd;
      if (isPrefixMatch) {
        const suffix = word.slice(primaryFoodTerm.length);
        const shouldExpandPluralSuffix = suffix === 's' || suffix === 'es';
        if (shouldExpandPluralSuffix) {
          highlightStart = wordStart;
          highlightEnd = wordEnd;
        }
      } else if (isSuffixMatch) {
        // Keep highlight only on the matching suffix (e.g. "burger" in "cheeseburger").
        highlightStart = matchStart;
        highlightEnd = matchEnd;
      }

      const before = foodName.slice(0, highlightStart);
      const match = foodName.slice(highlightStart, highlightEnd);
      const after = foodName.slice(highlightEnd);
      return (
        <>
          {before}
          <Text variant="body" weight="semibold" style={styles.topFoodNameInline}>
            {match}
          </Text>
          {after}
        </>
      );
    },
    [primaryFoodSingleWord, primaryFoodTerm]
  );

  const resolveMoreLabel = React.useCallback((hiddenCount: number): string | null => {
    if (hiddenCount <= 0) {
      return null;
    }
    return `+${hiddenCount} more`;
  }, []);

  const visibleTopFoodsForRender = React.useMemo(() => {
    if (visibleTopFoods.length > 0) {
      return visibleTopFoods;
    }
    if (!hasMeasured && measuredCandidateTopFoods.length > 0) {
      return measuredCandidateTopFoods.slice(0, 1);
    }
    return visibleTopFoods;
  }, [hasMeasured, measuredCandidateTopFoods, visibleTopFoods]);
  const hiddenTopFoodCountForRender = React.useMemo(
    () =>
      hasMeasured
        ? hiddenTopFoodCount
        : Math.max(0, totalDishCount - visibleTopFoodsForRender.length),
    [hasMeasured, hiddenTopFoodCount, totalDishCount, visibleTopFoodsForRender.length]
  );

  const renderTopFoodInlineChildren = React.useCallback((): React.ReactNode => {
    if (visibleTopFoodsForRender.length === 0) {
      return dishCountLabel;
    }
    const moreLabel = resolveMoreLabel(hiddenTopFoodCountForRender);
    const shouldIncludeMore = Boolean(moreLabel);

    const parts: React.ReactNode[] = [];
    visibleTopFoodsForRender.forEach((food, idx) => {
      parts.push(
        <Text
          key={`rank-${food.connectionId}`}
          variant="body"
          weight="semibold"
          style={styles.topFoodRankInline}
        >
          {idx + 1}.
        </Text>
      );
      parts.push(
        <Text
          key={`name-${food.connectionId}`}
          variant="body"
          weight="regular"
          style={styles.topFoodNameInline}
        >
          {' '}
          {renderHighlightedFoodName(food.foodName)}
        </Text>
      );
      if (idx < visibleTopFoodsForRender.length - 1 || shouldIncludeMore) {
        parts.push(TOP_FOOD_INLINE_GAP);
      }
    });

    if (shouldIncludeMore) {
      parts.push(
        <Text key="more" variant="body" weight="semibold" style={styles.topFoodMore}>
          {moreLabel}
        </Text>
      );
    }

    return parts;
  }, [
    dishCountLabel,
    hiddenTopFoodCountForRender,
    renderHighlightedFoodName,
    resolveMoreLabel,
    visibleTopFoodsForRender,
  ]);
  const shouldRenderTopFoodMeasurementNodes = measuredCandidateTopFoods.length > 0 && !allCached;

  const restaurantStatusLine = renderMetaDetailLine(
    hasStatus ? restaurant.operatingStatus : null,
    null,
    hasStatus ? restaurant.distanceMiles : null,
    'left',
    undefined,
    true,
    true,
    undefined,
    hasStatus ? coverageLabel : null
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
                  {rank}
                </Text>
              </View>
              <Text
                variant="subtitle"
                weight="semibold"
                style={[styles.textSlate900, styles.cardTitleText]}
                numberOfLines={2}
              >
                {restaurant.restaurantName}
              </Text>
            </View>
            <View style={[styles.resultContent, styles.resultContentStack]}>
              {displayScoreValue !== null && displayScoreValue !== undefined ? (
                <View style={styles.metricBlock}>
                  <View style={[styles.restaurantMetricRow, styles.metricSupportRow]}>
                    <View style={styles.restaurantMetricLeft}>
                      {STORE_ICON}
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
                        {INFO_CIRCLE_ICON_RESTAURANT}
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
                            {coverageLabel ? (
                              <>
                                <Text variant="body" style={styles.metricDot}>
                                  {'·'}
                                </Text>
                                <Text
                                  variant="body"
                                  style={styles.resultMetaDistance}
                                  numberOfLines={1}
                                >
                                  {coverageLabel}
                                </Text>
                              </>
                            ) : null}
                          </>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}
              {candidateTopFoods.length > 0 ? (
                <View style={styles.topFoodSection}>
                  <View style={styles.topFoodInlineRow}>
                    <View
                      style={styles.topFoodInlineLineContainer}
                      onLayout={handleTopFoodLineLayout}
                    >
                      <Text
                        variant="body"
                        weight={visibleTopFoodsForRender.length > 0 ? 'regular' : 'semibold'}
                        style={styles.topFoodInlineLineText}
                        numberOfLines={1}
                        ellipsizeMode={visibleTopFoodsForRender.length > 0 ? 'clip' : 'tail'}
                      >
                        {renderTopFoodInlineChildren()}
                      </Text>
                      {shouldRenderTopFoodMeasurementNodes ? (
                        <View style={styles.topFoodInlineMeasure}>
                          {measuredCandidateTopFoods.map((food, index) => (
                            <Text
                              key={`top-food-measure-item-${food.connectionId}`}
                              variant="body"
                              weight="regular"
                              style={styles.topFoodMeasureText}
                              onLayout={onItemLayout(food.connectionId)}
                            >
                              <Text
                                variant="body"
                                weight="semibold"
                                style={styles.topFoodRankInline}
                              >
                                {index + 1}.
                              </Text>
                              <Text
                                variant="body"
                                weight="regular"
                                style={styles.topFoodNameInline}
                              >
                                {' '}
                                {renderHighlightedFoodName(food.foodName)}
                              </Text>
                              {TOP_FOOD_INLINE_GAP}
                            </Text>
                          ))}
                          {topFoodMoreCounts.map((count) => {
                            const moreLabel = resolveMoreLabel(count);
                            if (!moreLabel) {
                              return null;
                            }
                            return (
                              <Text
                                key={`top-food-measure-more-${count}`}
                                variant="body"
                                weight="semibold"
                                style={styles.topFoodMore}
                                onLayout={onMoreLayout(count)}
                              >
                                {TOP_FOOD_INLINE_GAP}
                                {moreLabel}
                              </Text>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
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
              {SHARE_ICON}
            </Pressable>
          </View>
        </View>
      </Pressable>
    </View>
  );
};

export default React.memo(RestaurantResultCard);
