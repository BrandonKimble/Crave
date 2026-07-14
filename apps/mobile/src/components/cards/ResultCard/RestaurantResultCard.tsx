import React from 'react';
import { type LayoutChangeEvent, Pressable, TouchableOpacity, View } from 'react-native';

import { Store } from 'lucide-react-native';

// ─── ResultCard PRIMITIVE (leg 11, listdetail-ideal §2d) ────────────────────────────────────
// The ONE restaurant card, extracted from screens/Search/components (literal move — the
// results surface must not change visually). Per-surface variation = the declared SLOTS
// below (note · footerSlot · onAddPhoto), never forks:
//   results        — no slot props passed (byte-parity with the pre-extraction card).
//   listDetail     — note + onAddPhoto (+ footerSlot when the edit footer lands).
//   read-only list — note only (viewer role: no add tile, no edit footer).
// The search-side helper modules (styles, descriptor cache, top-food measurement) still
// live under screens/Search — they are the results surface's prepared-render machinery and
// travel only if/when search itself is re-homed.
import { Text } from '../..';
import { showShareModal } from '../../share-modal-store';
import { CardPhotoStrip } from '../../photos/CardPhotoStrip';
import { colors as themeColors } from '../../../constants/theme';
import { FONT_SIZES } from '../../../constants/typography';
import { getPriceRangeLabel } from '../../../constants/pricing';
import type { RestaurantResult } from '../../../types';
import { useSearchInteraction } from '../../../screens/Search/context/SearchInteractionContext';
import { useTopFoodMeasurement } from '../../../screens/Search/hooks/use-top-food-measurement';
import styles from '../../../screens/Search/styles';
import {
  SECONDARY_METRIC_ICON_SIZE,
  TOP_FOOD_RENDER_LIMIT,
} from '../../../screens/Search/constants/search';
import {
  formatDistanceMiles,
  resolveMarketDisplayLabel,
} from '../../../screens/Search/utils/format';
import { formatRankLabel, getRankFontSize } from '../../../screens/Search/utils/rank-badge';
import CraveScoreText from '../../../screens/Search/components/CraveScoreText';
import { formatCraveScoreMovement } from '../../../screens/Search/utils/quality';
import { InfoCircleIcon } from '../../../screens/Search/components/metric-icons';
import { renderMetaDetailLine } from '../../../screens/Search/components/render-meta-detail-line';
import {
  buildRestaurantCardHighlightedTextSegments,
  createRestaurantCardPrimaryFoodHighlight,
  formatRestaurantCardMatchedTagLabel,
  type RestaurantResultCardDescriptor,
  type RestaurantResultCardMatchedTagDescriptor,
  type RestaurantResultCardTextSegment,
} from '../../../screens/Search/components/restaurant-result-card-descriptor';
import CardActionPillRow from './CardActionPillRow';
import {
  RESULT_CARD_GALLERY_HEIGHT,
  RESULT_CARD_GALLERY_TILE_ASPECT,
  RESULT_CARD_GUTTER,
  resultCardSlotStyles,
} from './result-card-slot-styles';

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

const MAX_MATCHED_TAGS = 3;

type ScoreInfoPayload = {
  type: 'dish' | 'restaurant';
  title: string;
  score: number | null | undefined;
  rising: number | null | undefined;
  votes: number | null | undefined;
  polls: number | null | undefined;
};

type RestaurantResultCardProps = {
  restaurant: RestaurantResult;
  index: number;
  rank: number;
  qualityColor: string;
  preparedDescriptor?: RestaurantResultCardDescriptor | null;
  isLiked: boolean;
  primaryMarketKey?: string | null;
  showMarketLabel?: boolean;
  onSavePress: () => void;
  openRestaurantProfile: (
    restaurant: RestaurantResult,
    source?: 'results_sheet' | 'auto_open_single_candidate'
  ) => void;
  openScoreInfo: (payload: ScoreInfoPayload) => void;
  primaryFoodTerm: string | null;
  /** Slot (listDetail/read-only variants): the saver's note, under the gallery row (§8.1). */
  note?: string | null;
  /** Slot (listDetail variant): edit footer (ellipsis↔handle crossfade seat). */
  footerSlot?: React.ReactNode;
  /** Slot: own-list surfaces pass the photo-funnel opener → gallery grows the plus lead tile. */
  onAddPhoto?: () => void;
  /** Gallery row height override (wave-3 §3.3 default = 96). */
  galleryHeight?: number;
};

const RestaurantResultCard: React.FC<RestaurantResultCardProps> = ({
  restaurant,
  index,
  rank,
  qualityColor,
  preparedDescriptor: maybePreparedDescriptor = null,
  isLiked,
  primaryMarketKey = null,
  showMarketLabel = false,
  onSavePress,
  openRestaurantProfile,
  openScoreInfo,
  primaryFoodTerm: _primaryFoodTerm,
  note = null,
  footerSlot = null,
  onAddPhoto,
  galleryHeight = RESULT_CARD_GALLERY_HEIGHT,
}) => {
  const preparedDescriptor =
    maybePreparedDescriptor?.restaurantId === restaurant.restaurantId
      ? maybePreparedDescriptor
      : null;
  const primaryFoodHighlight = React.useMemo(
    () =>
      preparedDescriptor?.primaryFoodHighlight ??
      createRestaurantCardPrimaryFoodHighlight(_primaryFoodTerm),
    [preparedDescriptor, _primaryFoodTerm]
  );

  const priceRangeLabel =
    preparedDescriptor?.priceRangeLabel ?? getPriceRangeLabel(restaurant.priceLevel);
  const hasStatus =
    preparedDescriptor?.hasStatus ??
    (restaurant.operatingStatus?.isOpen === true || restaurant.operatingStatus?.isOpen === false);
  const distanceLabel =
    preparedDescriptor?.distanceLabel ?? formatDistanceMiles(restaurant.distanceMiles);
  const showDistanceInScore =
    preparedDescriptor?.showDistanceInScore ?? (!hasStatus && distanceLabel !== null);
  const topFoodItems = restaurant.topFood ?? [];
  const totalDishCount =
    preparedDescriptor?.totalDishCount ??
    Math.max(restaurant.totalDishCount ?? topFoodItems.length, topFoodItems.length);
  const craveScoreValue = React.useMemo(() => {
    if (preparedDescriptor != null) {
      return preparedDescriptor.craveScoreValue;
    }
    return typeof restaurant.craveScore === 'number' && Number.isFinite(restaurant.craveScore)
      ? restaurant.craveScore
      : null;
  }, [preparedDescriptor, restaurant.craveScore]);
  const marketLabel =
    preparedDescriptor?.marketLabel ??
    (showMarketLabel && restaurant.marketKey && restaurant.marketKey !== primaryMarketKey
      ? resolveMarketDisplayLabel(restaurant.marketName, restaurant.marketKey ?? null)
      : null);

  const candidateTopFoods = React.useMemo(
    () => preparedDescriptor?.candidateTopFoods ?? topFoodItems.slice(0, TOP_FOOD_RENDER_LIMIT),
    [preparedDescriptor, topFoodItems]
  );
  const matchedTags = React.useMemo<RestaurantResultCardMatchedTagDescriptor[]>(() => {
    if (preparedDescriptor != null) {
      return preparedDescriptor.matchedTags;
    }
    return (restaurant.matchedTags ?? [])
      .filter((tag) => typeof tag.name === 'string' && tag.name.trim().length > 0)
      .slice(0, MAX_MATCHED_TAGS)
      .map((tag) => ({
        key: `${restaurant.restaurantId}-${tag.entityId}`,
        label: formatRestaurantCardMatchedTagLabel(tag),
      }))
      .filter((tag) => tag.label.length > 0);
  }, [preparedDescriptor, restaurant.matchedTags, restaurant.restaurantId]);
  const dishCountLabel =
    preparedDescriptor?.dishCountLabel ??
    (totalDishCount === 1 ? '1 dish' : `${totalDishCount} dishes`);
  const { interactionRef } = useSearchInteraction();
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
    (connectionId: string, foodName: string): React.ReactNode => {
      const segments =
        preparedDescriptor?.topFoodNameSegmentsByConnectionId.get(connectionId) ??
        buildRestaurantCardHighlightedTextSegments(foodName, primaryFoodHighlight);
      if (segments.length === 1 && !segments[0]?.highlighted) {
        return segments[0]?.text ?? foodName;
      }
      return (
        <>
          {segments.map((segment: RestaurantResultCardTextSegment, segmentIndex: number) =>
            segment.highlighted ? (
              <Text
                key={`${connectionId}:highlight:${segmentIndex}`}
                variant="body"
                weight="semibold"
                style={styles.topFoodNameInline}
              >
                {segment.text}
              </Text>
            ) : (
              segment.text
            )
          )}
        </>
      );
    },
    [preparedDescriptor, primaryFoodHighlight]
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
          {renderHighlightedFoodName(food.connectionId, food.foodName)}
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
  const rankLabel = preparedDescriptor?.rankLabel ?? formatRankLabel(rank);
  const rankFontSize = preparedDescriptor?.rankFontSize ?? getRankFontSize(FONT_SIZES.title, rank);

  const restaurantStatusLine = renderMetaDetailLine(
    hasStatus ? restaurant.operatingStatus : null,
    null,
    hasStatus ? restaurant.distanceMiles : null,
    'left',
    undefined,
    true,
    true,
    undefined,
    hasStatus ? marketLabel : null
  );

  // W3 universal share modal replaces the ad-hoc OS share sheet.
  const handleShare = React.useCallback(() => {
    showShareModal({
      kind: 'restaurant',
      id: restaurant.restaurantId,
      title: restaurant.restaurantName,
    });
  }, [restaurant.restaurantId, restaurant.restaurantName]);

  const handleRestaurantInfoPress = React.useCallback(() => {
    openScoreInfo({
      type: 'restaurant',
      title: restaurant.restaurantName,
      score: craveScoreValue,
      rising: restaurant.rising ?? null,
      votes: restaurant.scoreInfo?.voteCount ?? null,
      polls: restaurant.scoreInfo?.pollCount ?? null,
    });
  }, [
    craveScoreValue,
    openScoreInfo,
    restaurant.restaurantName,
    restaurant.rising,
    restaurant.scoreInfo,
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
        // Rig lever (CLAUDE.md maestro gotchas): element-id taps are the ONLY reliable
        // way to drive a Pressable on the gesture-handoff sheet — coordinate/text taps
        // get eaten by the pan gesture.
        testID={`result-card-press-${restaurant.restaurantId}`}
        accessibilityRole="button"
        accessibilityLabel={`View ${restaurant.restaurantName}`}
      >
        <View style={styles.resultHeader}>
          <View style={styles.resultTitleContainer}>
            <View style={[styles.titleRow, styles.titleRowWithActions]}>
              <View style={[styles.rankBadge, { backgroundColor: qualityColor }]}>
                <Text variant="body" style={[styles.rankBadgeText, { fontSize: rankFontSize }]}>
                  {rankLabel}
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
            <View
              style={[
                styles.resultContent,
                styles.resultContentStack,
                resultCardSlotStyles.metaFlush,
              ]}
            >
              {restaurant.exactMatch === false ? (
                <Text variant="caption" style={styles.similarMatchLabel}>
                  Similar match
                </Text>
              ) : null}
              {craveScoreValue !== null && craveScoreValue !== undefined ? (
                <View style={styles.metricBlock}>
                  <View style={[styles.restaurantMetricRow, styles.metricSupportRow]}>
                    <View style={styles.restaurantMetricLeft}>
                      {STORE_ICON}
                      <CraveScoreText
                        score={craveScoreValue}
                        variant="body"
                        weight="semibold"
                        style={styles.metricValue}
                      />
                      {formatCraveScoreMovement(restaurant.rising ?? null) ? (
                        <Text
                          variant="body"
                          weight="medium"
                          style={{ marginLeft: 4, color: themeColors.textBody }}
                        >
                          {formatCraveScoreMovement(restaurant.rising ?? null)}
                        </Text>
                      ) : null}
                      <TouchableOpacity
                        onPress={handleRestaurantInfoPress}
                        style={styles.scoreInfoIconButton}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="How restaurant ratings are calculated"
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
                            {marketLabel ? (
                              <>
                                <Text variant="body" style={styles.metricDot}>
                                  {'·'}
                                </Text>
                                <Text
                                  variant="body"
                                  style={styles.resultMetaDistance}
                                  numberOfLines={1}
                                >
                                  {marketLabel}
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
                                {renderHighlightedFoodName(food.connectionId, food.foodName)}
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
              {matchedTags.length > 0 ? (
                <View style={styles.matchedTagsSection}>
                  <Text variant="caption" weight="semibold" style={styles.matchedTagsLabel}>
                    Mentioned for
                  </Text>
                  <View style={styles.matchedTagsRow}>
                    {matchedTags.map((tag) => (
                      <View key={tag.key} style={styles.matchedTagPill}>
                        <Text variant="caption" weight="semibold" style={styles.matchedTagText}>
                          {tag.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
              {restaurantStatusLine ? (
                <View style={styles.resultMetaLine}>{restaurantStatusLine}</View>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
      {/* §7.1 card anatomy: gallery, then the §3.1 pill action row. Full-bleed
          (§2.4 — the toggle-strip law): the strip escapes the card gutter and the
          first tile re-aligns via a scrollable inset, so photos slide under both
          screen edges. Sibling of the Pressable so photo taps never open the
          profile. */}
      <View style={[styles.cardPhotoStripSection, resultCardSlotStyles.galleryBleed]}>
        <CardPhotoStrip
          restaurantId={restaurant.restaurantId}
          height={galleryHeight}
          tileAspect={RESULT_CARD_GALLERY_TILE_ASPECT}
          contentInset={RESULT_CARD_GUTTER}
          leadTile={onAddPhoto ? 'add' : undefined}
          onAddPress={onAddPhoto}
        />
      </View>
      {note ? (
        <Text
          variant="caption"
          style={resultCardSlotStyles.note}
          testID={`result-card-note-${restaurant.restaurantId}`}
        >
          {note}
        </Text>
      ) : null}
      {/* Wave-3 §3.1: Save · Share · Call · Dishes — the card-body heart/share
          moved here; Call renders only when the restaurant carries a phone. */}
      <CardActionPillRow
        onSave={onSavePress}
        isSaved={isLiked}
        onShare={handleShare}
        phoneNumber={
          restaurant.displayLocation?.phoneNumber ??
          restaurant.locations?.find((location) => location.phoneNumber != null)?.phoneNumber ??
          null
        }
        onDishes={handleRestaurantPress}
        testID={`result-card-pills-${restaurant.restaurantId}`}
      />
      {footerSlot}
    </View>
  );
};

export default React.memo(RestaurantResultCard);
