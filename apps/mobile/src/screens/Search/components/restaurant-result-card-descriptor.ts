import { FONT_SIZES } from '../../../constants/typography';
import { getPriceSymbolLabel } from '../../../constants/pricing';
import type { RestaurantFoodSnippet, RestaurantMatchedTag, RestaurantResult } from '../../../types';
import { TOP_FOOD_RENDER_LIMIT } from '../constants/search';
import type { CachedTopFoodLayout } from '../hooks/use-top-food-measurement';
import { formatDistanceMiles } from '../utils/format';
import { formatRankLabel, getRankFontSize } from '../utils/rank-badge';
import {
  splitMatchSegmentsWithPolicy,
  type SuggestionMatchPolicy,
  type SuggestionMatchSegment,
} from '../utils/suggestion-match-highlight';

const MAX_MATCHED_TAGS = 3;

// F2302: the card once carried its OWN matcher. It does not any more — these are
// the card's presentation rules over the ONE spec-covered matcher in
// utils/suggestion-match-highlight.ts.
const RESTAURANT_CARD_HIGHLIGHT_POLICY: SuggestionMatchPolicy = {
  minLength: 3,
  singleWordOnly: true,
  expandPluralSuffix: true,
};

export const buildRestaurantCardHighlightedTextSegments = (
  foodName: string,
  highlight: RestaurantResultCardPrimaryFoodHighlight | null
): SuggestionMatchSegment[] => {
  if (highlight == null) {
    return [{ text: foodName, isMatch: false }];
  }
  return splitMatchSegmentsWithPolicy(
    highlight.term,
    foodName,
    RESTAURANT_CARD_HIGHLIGHT_POLICY
  );
};

export type RestaurantResultCardMatchedTagDescriptor = {
  key: string;
  label: string;
};

export type RestaurantResultCardPrimaryFoodHighlight = {
  term: string;
};

export type RestaurantResultCardDescriptor = {
  candidateTopFoods: RestaurantFoodSnippet[];
  craveScoreValue: number | null;
  dishCountLabel: string;
  distanceLabel: string | null;
  hasStatus: boolean;
  matchedTags: RestaurantResultCardMatchedTagDescriptor[];
  priceRangeLabel: string | null;
  primaryFoodHighlight: RestaurantResultCardPrimaryFoodHighlight | null;
  primaryFoodTerm: string | null;
  qualityColor: string;
  rank: number;
  rankFontSize: number;
  rankLabel: string;
  restaurantId: string;
  showDistanceInScore: boolean;
  topFoodLayout: CachedTopFoodLayout | null;
  topFoodNameSegmentsByConnectionId: Map<string, SuggestionMatchSegment[]>;
  totalDishCount: number;
};

export const normalizeRestaurantCardPrimaryFoodTerm = (
  primaryFoodTerm: string | null | undefined
): string | null => {
  if (typeof primaryFoodTerm !== 'string') {
    return null;
  }
  const trimmed = primaryFoodTerm.trim();
  return trimmed.length ? trimmed : null;
};

export const createRestaurantCardPrimaryFoodHighlight = (
  primaryFoodTerm: string | null | undefined
): RestaurantResultCardPrimaryFoodHighlight | null => {
  const normalized = normalizeRestaurantCardPrimaryFoodTerm(primaryFoodTerm);
  if (normalized == null) {
    return null;
  }
  return { term: normalized };
};

const resolveCraveScoreValue = (restaurant: RestaurantResult): number | null => {
  return typeof restaurant.craveScore === 'number' && Number.isFinite(restaurant.craveScore)
    ? restaurant.craveScore
    : null;
};

export const formatRestaurantCardMatchedTagLabel = (tag: RestaurantMatchedTag): string => {
  const trimmedName = tag.name.trim();
  if (!trimmedName.length) {
    return '';
  }
  if (!Number.isFinite(tag.mentionCount) || tag.mentionCount <= 0) {
    return trimmedName;
  }
  return `${trimmedName} ${tag.mentionCount}`;
};

export const buildRestaurantResultCardDescriptor = ({
  primaryFoodTerm,
  qualityColor,
  rank,
  restaurant,
  topFoodLayout = null,
}: {
  primaryFoodTerm: string | null | undefined;
  qualityColor: string;
  rank: number;
  restaurant: RestaurantResult;
  topFoodLayout?: CachedTopFoodLayout | null;
}): RestaurantResultCardDescriptor => {
  const topFoodItems = restaurant.topFood ?? [];
  const candidateTopFoods = topFoodItems.slice(0, TOP_FOOD_RENDER_LIMIT);
  const totalDishCount = Math.max(
    restaurant.totalDishCount ?? topFoodItems.length,
    topFoodItems.length
  );
  const primaryFoodHighlight = createRestaurantCardPrimaryFoodHighlight(primaryFoodTerm);
  const topFoodNameSegmentsByConnectionId = new Map<string, SuggestionMatchSegment[]>();
  candidateTopFoods.forEach((food) => {
    topFoodNameSegmentsByConnectionId.set(
      food.connectionId,
      buildRestaurantCardHighlightedTextSegments(food.foodName, primaryFoodHighlight)
    );
  });
  const hasStatus =
    restaurant.operatingStatus?.isOpen === true || restaurant.operatingStatus?.isOpen === false;
  const distanceLabel = formatDistanceMiles(restaurant.distanceMiles);
  const matchedTags = (restaurant.matchedTags ?? [])
    .filter((tag) => typeof tag.name === 'string' && tag.name.trim().length > 0)
    .slice(0, MAX_MATCHED_TAGS)
    .map((tag) => ({
      key: `${restaurant.restaurantId}-${tag.entityId}`,
      label: formatRestaurantCardMatchedTagLabel(tag),
    }))
    .filter((tag) => tag.label.length > 0);

  return {
    candidateTopFoods,
    craveScoreValue: resolveCraveScoreValue(restaurant),
    dishCountLabel: totalDishCount === 1 ? '1 dish' : `${totalDishCount} dishes`,
    distanceLabel,
    hasStatus,
    matchedTags,
    // F1019: prefer the REAL Google price range from the server (RestaurantPanel does the
    // same); fall back to the real priceSymbol ('$$'), NEVER to a client-invented dollar
    // band (the old PRICE_LEVEL_RANGE_LABELS-shaped table) — no-fake-estimates law: an
    // observed value beats a fabricated one, and a symbol is observed while a level-derived
    // range is not.
    priceRangeLabel:
      restaurant.priceRangeText ?? getPriceSymbolLabel(restaurant.priceLevel) ?? null,
    primaryFoodHighlight,
    primaryFoodTerm: primaryFoodHighlight?.term ?? null,
    qualityColor,
    rank,
    rankFontSize: getRankFontSize(FONT_SIZES.title, rank),
    rankLabel: formatRankLabel(rank),
    restaurantId: restaurant.restaurantId,
    showDistanceInScore: !hasStatus && distanceLabel !== null,
    topFoodLayout,
    topFoodNameSegmentsByConnectionId,
    totalDishCount,
  };
};
