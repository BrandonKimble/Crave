import React from 'react';
import type { ScoreInfoStorePayload } from '../../score-info-store';
import { Pressable, TouchableOpacity, View } from 'react-native';

import { HandPlatter } from 'lucide-react-native';

// ─── ResultCard PRIMITIVE, dish shape (leg 11, listdetail-ideal §2d) ────────────────────────
// Extracted from screens/Search/components (literal move — results byte-parity). Variation =
// the declared slots (note · onAddPhoto), same law as RestaurantResultCard.
import { Text } from '../..';
import { showShareModal } from '../../share-modal-store';
import { CardPhotoStrip } from '../../photos/CardPhotoStrip';
import { colors as themeColors } from '../../../constants/theme';
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
import { resolveRestaurantPhoneNumber } from './result-card-helpers';
import { useSavedMembership } from '../../../store/saved-membership-store';
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

// F898 (2026-08-03): ONE payload type. This shape was declared THREE times — here, in
// DishResultCard, and (as `ScoreInfoStorePayload`) in score-info-store, which is the
// declaration that actually crosses the seam. The two card-local copies are aliases of the
// store's now, so a field added to the surface cannot be missing from a caller.
type ScoreInfoPayload = ScoreInfoStorePayload;

type DishResultCardProps = {
  item: FoodResult;
  index: number;
  qualityColor: string;
  restaurantForDish?: RestaurantResult;
  onSavePress: () => void;
  /** Own/collaborator list detail: first pill = Edit (note + remove) —
   *  onSavePress then opens the item editor, not the save modal. */
  pillEditMode?: boolean;
  openRestaurantProfile: (
    restaurant: RestaurantResult,
    source?: 'results_sheet' | 'auto_open_single_candidate' | 'dish_card'
  ) => void;
  openScoreInfo: (payload: ScoreInfoPayload) => void;
  /** Slot (listDetail/read-only variants): the saver's note, under the gallery row (§8.1). */
  note?: string | null;
  /** Slot: own-list surfaces pass the photo-funnel opener → gallery grows the plus lead tile. */
  onAddPhoto?: () => void;
};

const DishResultCard: React.FC<DishResultCardProps> = ({
  item,
  index,
  qualityColor,
  restaurantForDish,
  onSavePress,
  pillEditMode = false,
  openRestaurantProfile,
  openScoreInfo,
  note = null,
  onAddPhoto,
}) => {
  const rank = index + 1;
  // Live saved-anywhere state (batched /lists/memberships read + optimistic
  // mutation marks) — the plus/saved pill design's single source of truth.
  const isSavedAnywhere = useSavedMembership('connection', item.connectionId);
  const trackRecentlyViewedFood = useSearchHistoryStore((state) => state.trackRecentlyViewedFood);
  // F1019: dish items carry no priceRangeText, only the real server-computed
  // restaurantPriceSymbol — use it directly, never a client-invented level-derived range.
  const dishPriceLabel = item.placePriceSymbol ?? undefined;
  const hasStatus = Boolean(item.placeOperatingStatus);
  const dishMetaPrimaryLine = renderMetaDetailLine(
    null,
    dishPriceLabel,
    hasStatus ? null : item.placeDistanceMiles,
    'left',
    item.placeName,
    true
  );
  const dishStatusLine = renderMetaDetailLine(
    item.placeOperatingStatus,
    null,
    hasStatus ? item.placeDistanceMiles : null,
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

  // F3719 — computed ONCE per render (was called twice inline: as the condition and as
  // the content).
  const scoreMovementLabel = formatCraveScoreMovement(item.rising ?? null);

  // W3 universal share modal (dish share id = the food entityId).
  const handleShare = React.useCallback(() => {
    showShareModal({ kind: 'dish', id: item.itemId, title: item.itemName });
  }, [item.itemId, item.itemName]);

  const handleDishPress = React.useCallback(() => {
    if (!restaurantForDish) {
      return;
    }

    void searchService
      .recordFoodView({
        connectionId: item.connectionId,
        itemId: item.itemId,
        source: 'results_sheet',
      })
      .catch(() => undefined);

    trackRecentlyViewedFood({
      connectionId: item.connectionId,
      itemId: item.itemId,
      itemName: item.itemName,
      placeId: restaurantForDish.placeId,
      placeName: restaurantForDish.placeName,
      statusPreview: {
        placeId: restaurantForDish.placeId,
        operatingStatus: item.placeOperatingStatus ?? null,
        distanceMiles: item.placeDistanceMiles ?? null,
        locationCount: null,
      },
    });

    openRestaurantProfile(restaurantForDish, 'dish_card');
  }, [
    item.connectionId,
    item.itemId,
    item.itemName,
    item.placeDistanceMiles,
    item.placeOperatingStatus,
    openRestaurantProfile,
    restaurantForDish,
    trackRecentlyViewedFood,
  ]);

  const handleDishInfoPress = React.useCallback(() => {
    openScoreInfo({
      type: 'dish',
      title: item.itemName,
      score: craveScoreValue,
      rising: item.rising ?? null,
      votes: item.scoreInfo?.voteCount ?? null,
      polls: item.scoreInfo?.pollCount ?? null,
    });
  }, [craveScoreValue, item.itemName, item.rising, item.scoreInfo, openScoreInfo]);

  return (
    <View
      key={item.connectionId}
      style={[styles.resultItem, index === 0 && styles.firstResultItem]}
    >
      <Pressable
        style={styles.resultPressable}
        onPress={handleDishPress}
        accessibilityRole={restaurantForDish ? 'button' : undefined}
        accessibilityLabel={restaurantForDish ? `View ${item.placeName}` : undefined}
        disabled={!restaurantForDish}
      >
        <View style={styles.resultHeader}>
          <View style={styles.resultTitleContainer}>
            <View style={styles.titleRow}>
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
                {item.itemName}
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
                  {scoreMovementLabel ? (
                    <Text
                      variant="body"
                      weight="medium"
                      style={{ marginLeft: 4, color: themeColors.textBody }}
                    >
                      {scoreMovementLabel}
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    onPress={handleDishInfoPress}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="How dish ratings are calculated"
                  >
                    {INFO_CIRCLE_ICON_DISH}
                  </TouchableOpacity>
                </View>
              </View>
              {dishMetaPrimaryLine ? <View>{dishMetaPrimaryLine}</View> : null}
              {dishStatusLine ? <View>{dishStatusLine}</View> : null}
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
          placeId={item.placeId}
          connectionId={item.connectionId}
          height={RESULT_CARD_GALLERY_HEIGHT}
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
        isSaved={isSavedAnywhere}
        editMode={pillEditMode}
        onShare={handleShare}
        phoneNumber={resolveRestaurantPhoneNumber(restaurantForDish)}
        testID={`result-card-pills-${item.connectionId}`}
      />
    </View>
  );
};

export default React.memo(DishResultCard);
