import React from 'react';
import { Pressable, TouchableOpacity, View } from 'react-native';

import { HandPlatter } from 'lucide-react-native';

// ─── ResultCard PRIMITIVE, dish shape (leg 11, listdetail-ideal §2d) ────────────────────────
// Extracted from screens/Search/components (literal move — results byte-parity). Variation =
// the declared slots (note · footerSlot · onAddPhoto), same law as RestaurantResultCard.
import { Text } from '../..';
import { showShareModal } from '../../share-modal-store';
import { CardPhotoStrip } from '../../photos/CardPhotoStrip';
import { colors as themeColors } from '../../../constants/theme';
import { getPriceRangeLabel } from '../../../constants/pricing';
import { FONT_SIZES } from '../../../constants/typography';
import type { FoodResult, RestaurantResult } from '../../../types';
import styles from '../../../screens/Search/styles';
import { SECONDARY_METRIC_ICON_SIZE } from '../../../screens/Search/constants/search';
import { InfoCircleIcon } from '../../../screens/Search/components/metric-icons';
import { renderMetaDetailLine } from '../../../screens/Search/components/render-meta-detail-line';
import { formatRankLabel, getRankFontSize } from '../../../screens/Search/utils/rank-badge';
import CraveScoreText from '../../../screens/Search/components/CraveScoreText';
import { formatCraveScoreMovement } from '../../../screens/Search/utils/quality';
import { searchService } from '../../../services/search';
import { useSearchHistoryStore } from '../../../store/searchHistoryStore';
import CardActionPillRow from './CardActionPillRow';
import {
  RESULT_CARD_GALLERY_HEIGHT,
  RESULT_CARD_GALLERY_TILE_ASPECT,
  RESULT_CARD_GUTTER,
  resultCardSlotStyles,
} from './result-card-slot-styles';

const HAND_PLATTER_ICON = (
  <HandPlatter
    size={SECONDARY_METRIC_ICON_SIZE}
    color={themeColors.primary}
    strokeWidth={2}
    style={styles.metricIcon}
  />
);

const INFO_CIRCLE_ICON_DISH = (
  <InfoCircleIcon
    size={SECONDARY_METRIC_ICON_SIZE + 2}
    color={themeColors.secondaryAccent}
    strokeWidth={2}
  />
);

type ScoreInfoPayload = {
  type: 'dish' | 'restaurant';
  title: string;
  score: number | null | undefined;
  rising: number | null | undefined;
  votes: number | null | undefined;
  polls: number | null | undefined;
};

type DishResultCardProps = {
  item: FoodResult;
  index: number;
  qualityColor: string;
  isLiked: boolean;
  restaurantForDish?: RestaurantResult;
  onSavePress: () => void;
  openRestaurantProfile: (
    restaurant: RestaurantResult,
    source?: 'results_sheet' | 'auto_open_single_candidate' | 'dish_card'
  ) => void;
  openScoreInfo: (payload: ScoreInfoPayload) => void;
  /** Slot (listDetail/read-only variants): the saver's note, under the gallery row (§8.1). */
  note?: string | null;
  /** Slot (listDetail variant): edit footer (ellipsis↔handle crossfade seat). */
  footerSlot?: React.ReactNode;
  /** Slot: own-list surfaces pass the photo-funnel opener → gallery grows the plus lead tile. */
  onAddPhoto?: () => void;
  /** Gallery row height override (results = 72). */
  galleryHeight?: number;
};

const DishResultCard: React.FC<DishResultCardProps> = ({
  item,
  index,
  qualityColor,
  isLiked,
  restaurantForDish,
  onSavePress,
  openRestaurantProfile,
  openScoreInfo,
  note = null,
  footerSlot = null,
  onAddPhoto,
  galleryHeight = RESULT_CARD_GALLERY_HEIGHT,
}) => {
  const rank = index + 1;
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
  const craveScoreValue = React.useMemo(() => {
    return typeof item.craveScore === 'number' && Number.isFinite(item.craveScore)
      ? item.craveScore
      : null;
  }, [item.craveScore]);

  // W3 universal share modal (dish share id = the food entityId).
  const handleShare = React.useCallback(() => {
    showShareModal({ kind: 'dish', id: item.foodId, title: item.foodName });
  }, [item.foodId, item.foodName]);

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

    openRestaurantProfile(restaurantForDish, 'dish_card');
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
      score: craveScoreValue,
      rising: item.rising ?? null,
      votes: item.scoreInfo?.voteCount ?? null,
      polls: item.scoreInfo?.pollCount ?? null,
    });
  }, [craveScoreValue, item.foodName, item.rising, item.scoreInfo, openScoreInfo]);

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
                <Text
                  variant="body"
                  style={[
                    styles.rankBadgeText,
                    { fontSize: getRankFontSize(FONT_SIZES.title, rank) },
                  ]}
                >
                  {formatRankLabel(rank)}
                </Text>
              </View>
              <Text
                variant="subtitle"
                weight="semibold"
                style={[styles.textSlate900, styles.cardTitleText]}
                numberOfLines={2}
              >
                {item.foodName}
              </Text>
            </View>
            <View style={[styles.cardBodyStack, resultCardSlotStyles.metaFlush]}>
              <View style={styles.metricBlock}>
                <View style={styles.metricLine}>
                  {HAND_PLATTER_ICON}
                  <CraveScoreText
                    score={craveScoreValue}
                    variant="body"
                    weight="semibold"
                    style={styles.metricValue}
                  />
                  {formatCraveScoreMovement(item.rising ?? null) ? (
                    <Text
                      variant="body"
                      weight="medium"
                      style={{ marginLeft: 4, color: themeColors.textBody }}
                    >
                      {formatCraveScoreMovement(item.rising ?? null)}
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    onPress={handleDishInfoPress}
                    style={styles.scoreInfoIconButton}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="How dish ratings are calculated"
                  >
                    {INFO_CIRCLE_ICON_DISH}
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
              {item.exactMatch === false ? (
                <Text variant="caption" style={styles.similarMatchLabel}>
                  Similar match
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
      {/* §7.1 card anatomy: gallery (dish-linked photos), then the §3.1 pill
          action row. Full-bleed (§2.4 — the toggle-strip law). Sibling of the
          Pressable so photo taps never open the profile. */}
      <View style={[styles.cardPhotoStripSection, resultCardSlotStyles.galleryBleed]}>
        <CardPhotoStrip
          restaurantId={item.restaurantId}
          connectionId={item.connectionId}
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
          testID={`result-card-note-${item.connectionId}`}
        >
          {note}
        </Text>
      ) : null}
      {/* Wave-3 §3.1: Save · Share · Call (Dishes is restaurant-cards-only) —
          the card-body heart/share moved here. */}
      <CardActionPillRow
        onSave={onSavePress}
        isSaved={isLiked}
        onShare={handleShare}
        phoneNumber={
          restaurantForDish?.displayLocation?.phoneNumber ??
          restaurantForDish?.locations?.find((location) => location.phoneNumber != null)
            ?.phoneNumber ??
          null
        }
        testID={`result-card-pills-${item.connectionId}`}
      />
      {footerSlot}
    </View>
  );
};

export default React.memo(DishResultCard);
