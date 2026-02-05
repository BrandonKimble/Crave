import React from 'react';
import {
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  Pressable,
  Share,
  TouchableOpacity,
  type TextLayoutEventData,
  View,
} from 'react-native';

import { Share as LucideShare, Heart as LucideHeart } from 'lucide-react-native';
import { Store } from 'lucide-react-native';

import { Text } from '../../../components';
import { colors as themeColors } from '../../../constants/theme';
import { getPriceRangeLabel } from '../../../constants/pricing';
import type { FoodResult, RestaurantResult } from '../../../types';
import styles from '../styles';
import { SECONDARY_METRIC_ICON_SIZE, TOP_FOOD_RENDER_LIMIT } from '../constants/search';
import { formatDistanceMiles, resolveCoverageDisplayLabel } from '../utils/format';
import { InfoCircleIcon } from './metric-icons';
import { renderMetaDetailLine } from './render-meta-detail-line';

const TOP_FOOD_INLINE_GAP = '\u2006\u2006\u2006\u2006';

const MAX_TOP_FOOD_FIT_CACHE_ITEMS = 1200;
type TopFoodFitVariant =
  | { kind: 'tokens'; shownCount: number; includeMore: boolean }
  | { kind: 'ellipsis_more' }
  | { kind: 'count' };
const topFoodFitCache = new Map<string, TopFoodFitVariant>();
const topFoodFitSignatureCache = new Map<string, TopFoodFitVariant>();
const getCachedTopFoodFit = (key: string): TopFoodFitVariant | null => {
  const value = topFoodFitCache.get(key);
  if (!value) return null;
  topFoodFitCache.delete(key);
  topFoodFitCache.set(key, value);
  return value;
};
const hasCachedTopFoodFit = (key: string): boolean => topFoodFitCache.has(key);
const setCachedTopFoodFit = (key: string, value: TopFoodFitVariant): void => {
  if (topFoodFitCache.has(key)) {
    topFoodFitCache.delete(key);
  }
  topFoodFitCache.set(key, value);
  if (topFoodFitCache.size > MAX_TOP_FOOD_FIT_CACHE_ITEMS) {
    const oldestKey = topFoodFitCache.keys().next().value as string | undefined;
    if (oldestKey) {
      topFoodFitCache.delete(oldestKey);
    }
  }
};

const getCachedTopFoodFitBySignature = (signature: string): TopFoodFitVariant | null => {
  const value = topFoodFitSignatureCache.get(signature);
  if (!value) return null;
  topFoodFitSignatureCache.delete(signature);
  topFoodFitSignatureCache.set(signature, value);
  return value;
};
const setCachedTopFoodFitBySignature = (signature: string, value: TopFoodFitVariant): void => {
  if (topFoodFitSignatureCache.has(signature)) {
    topFoodFitSignatureCache.delete(signature);
  }
  topFoodFitSignatureCache.set(signature, value);
  if (topFoodFitSignatureCache.size > MAX_TOP_FOOD_FIT_CACHE_ITEMS) {
    const oldestKey = topFoodFitSignatureCache.keys().next().value as string | undefined;
    if (oldestKey) {
      topFoodFitSignatureCache.delete(oldestKey);
    }
  }
};

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
  }, [
    restaurant.displayScore,
    restaurant.restaurantQualityScore,
    scoreMode,
  ]);
  const coverageLabel =
    showCoverageLabel && restaurant.coverageKey && restaurant.coverageKey !== primaryCoverageKey
      ? resolveCoverageDisplayLabel(restaurant.coverageName, restaurant.coverageKey)
      : null;

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

  const fitSignature = React.useMemo(() => {
    const ids = candidateTopFoods.map((food) => food.connectionId).join('|');
    const primaryKey = primaryFoodSingleWord ? primaryFoodTerm?.toLowerCase() ?? '' : '';
    return `${restaurant.restaurantId}:${totalDishCount}:${candidateTopFoods.length}:${primaryKey}:${ids}`;
  }, [
    candidateTopFoods,
    primaryFoodSingleWord,
    primaryFoodTerm,
    restaurant.restaurantId,
    totalDishCount,
  ]);
  const fitCacheKey = React.useMemo(() => {
    if (typeof topFoodLineWidth !== 'number' || topFoodLineWidth <= 0) {
      return null;
    }
    return `${Math.round(topFoodLineWidth)}:${fitSignature}`;
  }, [fitSignature, topFoodLineWidth]);

  const [fitVariant, setFitVariant] = React.useState<TopFoodFitVariant | null>(() =>
    getCachedTopFoodFitBySignature(fitSignature)
  );
  React.useEffect(() => {
    const cached = getCachedTopFoodFitBySignature(fitSignature);
    if (cached) {
      setFitVariant(cached);
      return;
    }
    setFitVariant(null);
  }, [fitSignature]);
  React.useEffect(() => {
    if (!fitCacheKey) {
      return;
    }
    const cached = getCachedTopFoodFit(fitCacheKey);
    if (cached) {
      setCachedTopFoodFitBySignature(fitSignature, cached);
      setFitVariant(cached);
    }
  }, [fitCacheKey]);

  type CandidateVariant = { id: string; variant: TopFoodFitVariant };
  const fitCandidates = React.useMemo((): CandidateVariant[] => {
    const maxCount = Math.min(candidateTopFoods.length, TOP_FOOD_RENDER_LIMIT);
    const items: CandidateVariant[] = [];
    const seen = new Set<string>();

    const add = (variant: TopFoodFitVariant) => {
      const id =
        variant.kind === 'count'
          ? 'count'
          : variant.kind === 'ellipsis_more'
          ? 'ellipsis_more'
          : `t${variant.shownCount}${variant.includeMore ? 'm' : 'n'}`;
      if (seen.has(id)) return;
      seen.add(id);
      items.push({ id, variant });
    };

    for (let shownCount = maxCount; shownCount >= 1; shownCount--) {
      const hiddenCount = totalDishCount - shownCount;
      add({ kind: 'tokens', shownCount, includeMore: hiddenCount > 0 });
    }
    // Fallbacks: ellipsize the first token with "+N more" if needed, or show the dish count.
    add({ kind: 'ellipsis_more' });
    add({ kind: 'count' });
    return items;
  }, [candidateTopFoods.length, totalDishCount]);

  const fitMeasurementsRef = React.useRef<{
    cacheKey: string | null;
    width: number;
    results: Record<string, boolean | undefined>;
    settled: boolean;
  }>({ cacheKey: null, width: 0, results: {}, settled: false });

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

  const resolveMoreLabel = React.useCallback(
    (hiddenCount: number): string | null => {
      if (hiddenCount <= 0) {
        return null;
      }
      if (primaryFoodSingleWord && primaryFoodTerm) {
        return `+${hiddenCount} ${primaryFoodTerm}`;
      }
      return `+${hiddenCount} more`;
    },
    [primaryFoodSingleWord, primaryFoodTerm]
  );

  const renderTopFoodInlineChildren = React.useCallback(
    (variant: TopFoodFitVariant): React.ReactNode => {
      if (variant.kind === 'count') {
        return dishCountLabel;
      }
      if (variant.kind === 'ellipsis_more') {
        // Rendered by the caller as a 2-part row so "+N more" never gets truncated by ellipsizing.
        return null;
      }

      const shownCount = Math.max(
        0,
        Math.min(variant.shownCount, candidateTopFoods.length, TOP_FOOD_RENDER_LIMIT)
      );
      const hiddenCount = Math.max(0, totalDishCount - shownCount);
      const moreLabel = variant.includeMore ? resolveMoreLabel(hiddenCount) : null;
      const shouldIncludeMore = Boolean(moreLabel);

      const parts: React.ReactNode[] = [];
      for (let idx = 0; idx < shownCount; idx++) {
        const food = candidateTopFoods[idx];
        if (!food) continue;
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
        if (idx < shownCount - 1 || shouldIncludeMore) {
          parts.push(TOP_FOOD_INLINE_GAP);
        }
      }

      if (shouldIncludeMore) {
        parts.push(
          <Text key="more" variant="body" weight="semibold" style={styles.topFoodMore}>
            {moreLabel}
          </Text>
        );
      }

      return parts;
    },
    [candidateTopFoods, dishCountLabel, renderHighlightedFoodName, resolveMoreLabel, totalDishCount]
  );

  const renderEllipsisMoreRow = React.useCallback((): React.ReactNode => {
    const firstFood = candidateTopFoods[0];
    if (!firstFood) {
      return (
        <Text
          variant="body"
          weight="semibold"
          style={styles.topFoodInlineLineText}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {dishCountLabel}
        </Text>
      );
    }
    const hiddenCount = Math.max(0, totalDishCount - 1);
    const moreLabel = resolveMoreLabel(hiddenCount);
    const shouldShowMore = Boolean(moreLabel);
    return (
      <View style={styles.topFoodInlineEllipsisRow}>
        <Text style={styles.topFoodInlineEllipsisToken} numberOfLines={1} ellipsizeMode="tail">
          <Text variant="body" weight="semibold" style={styles.topFoodRankInline}>
            1.
          </Text>
          <Text variant="body" weight="regular" style={styles.topFoodNameInline}>
            {' '}
            {renderHighlightedFoodName(firstFood.foodName)}
          </Text>
        </Text>
        {shouldShowMore ? (
          <Text variant="body" weight="semibold" style={styles.topFoodMore} numberOfLines={1}>
            {TOP_FOOD_INLINE_GAP}
            {moreLabel}
          </Text>
        ) : null}
      </View>
    );
  }, [
    candidateTopFoods,
    dishCountLabel,
    renderHighlightedFoodName,
    resolveMoreLabel,
    totalDishCount,
  ]);

  const settleFitVariant = React.useCallback(
    (nextVariant: TopFoodFitVariant) => {
      if (!fitCacheKey) return;
      setCachedTopFoodFit(fitCacheKey, nextVariant);
      setCachedTopFoodFitBySignature(fitSignature, nextVariant);
      setFitVariant(nextVariant);
      const snapshot = fitMeasurementsRef.current;
      snapshot.settled = true;
    },
    [fitCacheKey, fitSignature]
  );

  const maybeResolveFitVariant = React.useCallback(() => {
    const snapshot = fitMeasurementsRef.current;
    if (!fitCacheKey || snapshot.cacheKey !== fitCacheKey || snapshot.settled) {
      return;
    }
    for (const candidate of fitCandidates) {
      const fit = snapshot.results[candidate.id];
      if (fit === true) {
        settleFitVariant(candidate.variant);
        return;
      }
      if (fit !== false) {
        return;
      }
    }
    // Should not happen since we include fallbacks, but keep safe.
    settleFitVariant({ kind: 'count' });
  }, [fitCacheKey, fitCandidates, settleFitVariant]);

  const onCandidateTextLayout = React.useCallback(
    (candidateId: string) => (event: NativeSyntheticEvent<TextLayoutEventData>) => {
      if (!fitCacheKey) return;
      const snapshot = fitMeasurementsRef.current;
      if (snapshot.cacheKey !== fitCacheKey) {
        snapshot.cacheKey = fitCacheKey;
        snapshot.width = topFoodLineWidth ?? 0;
        snapshot.results = {};
        snapshot.settled = false;
      }
      if (snapshot.settled) {
        return;
      }
      const width = snapshot.width;
      const lines = event.nativeEvent.lines;
      const lineWidth = typeof lines?.[0]?.width === 'number' ? lines[0].width : null;
      const fits =
        Array.isArray(lines) &&
        lines.length === 1 &&
        (lineWidth === null || lineWidth <= width + 0.5);
      snapshot.results[candidateId] = fits;
      maybeResolveFitVariant();
    },
    [fitCacheKey, maybeResolveFitVariant, topFoodLineWidth]
  );

  const shouldMeasureFit =
    fitCacheKey !== null && candidateTopFoods.length > 0 && !hasCachedTopFoodFit(fitCacheKey);

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
                  {index + 1}
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
                      {fitVariant?.kind === 'ellipsis_more' ? (
                        renderEllipsisMoreRow()
                      ) : fitVariant?.kind === 'count' ? (
                        <Text
                          variant="body"
                          weight="semibold"
                          style={styles.topFoodInlineLineText}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {dishCountLabel}
                        </Text>
                      ) : fitVariant ? (
                        <Text
                          variant="body"
                          weight="regular"
                          style={styles.topFoodInlineLineText}
                          numberOfLines={1}
                          ellipsizeMode="clip"
                        >
                          {renderTopFoodInlineChildren(fitVariant)}
                        </Text>
                      ) : (
                        renderEllipsisMoreRow()
                      )}
                      {shouldMeasureFit && typeof topFoodLineWidth === 'number' ? (
                        <View
                          style={[
                            styles.topFoodInlineLineMeasureContainer,
                            { width: topFoodLineWidth },
                          ]}
                        >
                          {fitCandidates.map((candidate) => (
                            <Text
                              key={`top-food-fit-${candidate.id}`}
                              variant="body"
                              weight="regular"
                              style={styles.topFoodInlineLineText}
                              onTextLayout={onCandidateTextLayout(candidate.id)}
                            >
                              {renderTopFoodInlineChildren(candidate.variant)}
                            </Text>
                          ))}
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
              <LucideShare size={20} color={themeColors.textBody} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </Pressable>
    </View>
  );
};

export default React.memo(RestaurantResultCard);
