import { FONT_SIZES } from '../../../constants/typography';
import { getPriceRangeLabel } from '../../../constants/pricing';
import type { RestaurantFoodSnippet, RestaurantMatchedTag, RestaurantResult } from '../../../types';
import { TOP_FOOD_RENDER_LIMIT } from '../constants/search';
import type { CachedTopFoodLayout } from '../hooks/use-top-food-measurement';
import { formatDistanceMiles, resolveMarketDisplayLabel } from '../utils/format';
import { formatRankLabel, getRankFontSize } from '../utils/rank-badge';

const MAX_MATCHED_TAGS = 3;

export type RestaurantResultCardTextSegment = {
  highlighted: boolean;
  text: string;
};

export type RestaurantResultCardMatchedTagDescriptor = {
  key: string;
  label: string;
};

export type RestaurantResultCardPrimaryFoodHighlight = {
  singleWord: boolean;
  term: string;
  termLower: string;
};

export type RestaurantResultCardDescriptor = {
  candidateTopFoods: RestaurantFoodSnippet[];
  craveScoreValue: number | null;
  dishCountLabel: string;
  distanceLabel: string | null;
  hasStatus: boolean;
  matchedTags: RestaurantResultCardMatchedTagDescriptor[];
  marketLabel: string | null;
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
  topFoodNameSegmentsByConnectionId: Map<string, RestaurantResultCardTextSegment[]>;
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
  return {
    singleWord: !/\s/u.test(normalized),
    term: normalized,
    termLower: normalized.toLowerCase(),
  };
};

const isWordChar = (char: string | undefined): boolean => {
  if (!char) {
    return false;
  }
  return /[A-Za-z0-9]/.test(char);
};

export const buildRestaurantCardHighlightedTextSegments = (
  foodName: string,
  highlight: RestaurantResultCardPrimaryFoodHighlight | null
): RestaurantResultCardTextSegment[] => {
  if (!highlight?.singleWord || highlight.term.length < 3) {
    return [{ highlighted: false, text: foodName }];
  }

  const nameLower = foodName.toLowerCase();
  const matchIndex = nameLower.indexOf(highlight.termLower);
  if (matchIndex < 0) {
    return [{ highlighted: false, text: foodName }];
  }

  const matchStart = matchIndex;
  const matchEnd = matchIndex + highlight.term.length;

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
    const suffix = word.slice(highlight.term.length);
    const shouldExpandPluralSuffix = suffix === 's' || suffix === 'es';
    if (shouldExpandPluralSuffix) {
      highlightStart = wordStart;
      highlightEnd = wordEnd;
    }
  } else if (isSuffixMatch) {
    highlightStart = matchStart;
    highlightEnd = matchEnd;
  }

  const segments: RestaurantResultCardTextSegment[] = [];
  const before = foodName.slice(0, highlightStart);
  const match = foodName.slice(highlightStart, highlightEnd);
  const after = foodName.slice(highlightEnd);
  if (before.length > 0) {
    segments.push({ highlighted: false, text: before });
  }
  if (match.length > 0) {
    segments.push({ highlighted: true, text: match });
  }
  if (after.length > 0) {
    segments.push({ highlighted: false, text: after });
  }
  return segments.length > 0 ? segments : [{ highlighted: false, text: foodName }];
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
  primaryMarketKey,
  qualityColor,
  rank,
  restaurant,
  showMarketLabel,
  topFoodLayout = null,
}: {
  primaryFoodTerm: string | null | undefined;
  primaryMarketKey: string | null | undefined;
  qualityColor: string;
  rank: number;
  restaurant: RestaurantResult;
  showMarketLabel: boolean;
  topFoodLayout?: CachedTopFoodLayout | null;
}): RestaurantResultCardDescriptor => {
  const topFoodItems = restaurant.topFood ?? [];
  const candidateTopFoods = topFoodItems.slice(0, TOP_FOOD_RENDER_LIMIT);
  const totalDishCount = Math.max(
    restaurant.totalDishCount ?? topFoodItems.length,
    topFoodItems.length
  );
  const primaryFoodHighlight = createRestaurantCardPrimaryFoodHighlight(primaryFoodTerm);
  const topFoodNameSegmentsByConnectionId = new Map<string, RestaurantResultCardTextSegment[]>();
  candidateTopFoods.forEach((food) => {
    topFoodNameSegmentsByConnectionId.set(
      food.connectionId,
      buildRestaurantCardHighlightedTextSegments(food.foodName, primaryFoodHighlight)
    );
  });
  const hasStatus =
    restaurant.operatingStatus?.isOpen === true || restaurant.operatingStatus?.isOpen === false;
  const distanceLabel = formatDistanceMiles(restaurant.distanceMiles);
  const marketLabel =
    showMarketLabel && restaurant.marketKey && restaurant.marketKey !== primaryMarketKey
      ? resolveMarketDisplayLabel(restaurant.marketName, restaurant.marketKey ?? null)
      : null;
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
    marketLabel,
    priceRangeLabel: getPriceRangeLabel(restaurant.priceLevel) ?? null,
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
