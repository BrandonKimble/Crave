import type { FoodResult, RestaurantResult, SearchResponse } from '../types';
import type { FavoriteListDetail, FavoriteListType } from './favorite-lists';
import type { CuratedListDetailItem, CuratedListDetailResponse } from './home';

/**
 * Curated-list → ListDetail adapters (home-surface-charter Job 2): the app-
 * curated detail (GET /home/lists/:id) deliberately mirrors the favorites
 * detail vocabulary with viewerRole 'viewer'; these pure mappers express it in
 * the EXACT shapes ListDetailPanel already consumes (FavoriteListDetail meta +
 * a SearchResponse results body), so the panel is REUSED with a source
 * discriminator instead of cloned.
 *
 * Honesty rules (no-fake-estimates law): every field is either a server fact
 * or an empty/absent optional — nothing is invented. Fields the curated
 * payload cannot supply (hours → open-now, priceLevel → price) mean those
 * strip controls are HIDDEN for curated lists, never faked.
 *
 * KNOWN PAYLOAD GAP: dish-type curated items carry (foodId, restaurantId) but
 * NOT the resolved connectionId; the composite `${restaurantId}:${entityId}`
 * stands in as ROW IDENTITY only. A save from such a row fails loud at the API
 * (announcer), never silently corrupts — closing the gap needs connectionId in
 * the curated payload.
 */
export const resolveCuratedListType = (listType: string): FavoriteListType =>
  listType === 'dish' ? 'dish' : 'restaurant';

export const mapCuratedDetailToFavoriteListDetail = (
  detail: CuratedListDetailResponse
): FavoriteListDetail => ({
  list: {
    listId: detail.listId,
    name: detail.title,
    description: detail.subtitle,
    listType: resolveCuratedListType(detail.listType),
    visibility: 'public',
    itemCount: detail.itemCount,
    position: 0,
    systemKind: null,
    shareEnabled: false,
    updatedAt: detail.builtAt,
    previewItems: [],
  },
  viewerRole: 'viewer',
  defaultSort: 'best',
});

const mapCuratedItemToRestaurantResult = (item: CuratedListDetailItem): RestaurantResult => ({
  // Restaurant-type curated items: entityId IS the restaurant id (restaurantId null).
  restaurantId: item.restaurantId ?? item.entityId,
  restaurantName: item.label,
  restaurantAliases: [],
  rank: item.rank,
  scoreSubjectType: 'restaurant',
  scoreSubjectId: item.restaurantId ?? item.entityId,
  craveScore: item.craveScore ?? 0,
  ...(item.craveScoreExact != null ? { craveScoreExact: item.craveScoreExact } : {}),
  rising: item.rising,
  latitude: item.latitude,
  longitude: item.longitude,
  address: item.subLabel,
  topFood: [],
  totalDishCount: 0,
});

const mapCuratedItemToFoodResult = (item: CuratedListDetailItem): FoodResult => ({
  // PAYLOAD GAP (see module doc): composite row identity, not a real connectionId.
  connectionId: `${item.restaurantId ?? 'unknown'}:${item.entityId}`,
  foodId: item.entityId,
  foodName: item.label,
  foodAliases: [],
  restaurantId: item.restaurantId ?? '',
  restaurantName: item.subLabel ?? '',
  restaurantAliases: [],
  scoreSubjectType: 'connection',
  scoreSubjectId: `${item.restaurantId ?? 'unknown'}:${item.entityId}`,
  craveScore: item.craveScore ?? 0,
  ...(item.craveScoreExact != null ? { craveScoreExact: item.craveScoreExact } : {}),
  rising: item.rising,
  mentionCount: 0,
  totalUpvotes: 0,
  categories: [],
  foodAttributes: [],
  restaurantCraveScore: 0,
  restaurantLatitude: item.latitude,
  restaurantLongitude: item.longitude,
});

export const mapCuratedDetailToSearchResponse = (
  detail: CuratedListDetailResponse
): SearchResponse => {
  const listType = resolveCuratedListType(detail.listType);
  const dishes = listType === 'dish' ? detail.items.map(mapCuratedItemToFoodResult) : [];
  const restaurants =
    listType === 'restaurant' ? detail.items.map(mapCuratedItemToRestaurantResult) : [];
  return {
    format: 'dual_list',
    plan: {
      format: 'dual_list',
      restaurantFilters: [],
      connectionFilters: [],
      ranking: { foodOrder: 'rank', restaurantOrder: 'rank' },
      diagnostics: { missingEntities: [], notes: ['curated-list projection'] },
    },
    dishes,
    restaurants,
    metadata: {
      totalFoodResults: dishes.length,
      totalRestaurantResults: restaurants.length,
      queryExecutionTimeMs: 0,
      boundsApplied: false,
      openNowApplied: false,
      openNowSupportedRestaurants: 0,
      openNowUnsupportedRestaurants: 0,
      openNowFilteredOut: 0,
      page: 1,
      pageSize: detail.items.length,
    },
  };
};
