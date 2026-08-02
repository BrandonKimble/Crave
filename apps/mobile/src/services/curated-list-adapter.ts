import type { FoodResult, RestaurantResult, SearchResponse } from '../types';
import type { UserListDetail, UserListType } from './user-lists';
import type { CuratedListDetailItem, CuratedListDetailResponse } from './home';

/**
 * Curated-list → ListDetail adapters (home-surface-charter Job 2): the app-
 * curated detail (GET /home/lists/:id) deliberately mirrors the favorites
 * detail vocabulary with viewerRole 'viewer'; these pure mappers express it in
 * the EXACT shapes ListDetailPanel already consumes (UserListDetail meta +
 * a SearchResponse results body), so the panel is REUSED with a source
 * discriminator instead of cloned.
 *
 * Honesty rules (no-fake-estimates law): every field is either a server fact
 * or an empty/absent optional — nothing is invented. Fields the curated
 * payload cannot supply (hours → open-now, priceLevel → price) mean those
 * strip controls are HIDDEN for curated lists, never faked.
 *
 * Dish rows carry the connectionId the BUILDER stored at build time (an
 * FK-cascaded fact — it can never dangle), so hearts/saves on curated dish
 * rows always speak the real connection vocabulary. No synthetic ids exist:
 * a dish row without a connectionId (impossible except a legacy row predating
 * the column) is DROPPED from the projection rather than given a fake one.
 */
export const resolveCuratedListType = (listType: string): UserListType =>
  listType === 'dish' ? 'dish' : 'restaurant';

export const mapCuratedDetailToUserListDetail = (
  detail: CuratedListDetailResponse
): UserListDetail => ({
  list: {
    listId: detail.listId,
    name: detail.title,
    description: detail.subtitle,
    listType: resolveCuratedListType(detail.listType),
    kind: 'standard',
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
  // Non-null by the honesty filter at the call site (score-less rows are
  // dropped, never rendered as 0 — no-fake-estimates law).
  craveScore: item.craveScore!,
  ...(item.craveScoreExact != null ? { craveScoreExact: item.craveScoreExact } : {}),
  rising: item.rising,
  latitude: item.latitude,
  longitude: item.longitude,
  address: item.subLabel,
  topFood: [],
  totalDishCount: 0,
});

const mapCuratedItemToFoodResult = (
  item: CuratedListDetailItem & { connectionId: string }
): FoodResult => ({
  // Build-time connectionId (see module doc) — real by construction.
  connectionId: item.connectionId,
  foodId: item.entityId,
  foodName: item.label,
  foodAliases: [],
  restaurantId: item.restaurantId ?? '',
  restaurantName: item.subLabel ?? '',
  restaurantAliases: [],
  scoreSubjectType: 'connection',
  scoreSubjectId: item.connectionId,
  // Non-null by the honesty filter at the call site (score-less rows are
  // dropped, never rendered as 0 — no-fake-estimates law).
  craveScore: item.craveScore!,
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
  const dishes =
    listType === 'dish'
      ? detail.items
          .filter(
            (item): item is CuratedListDetailItem & { connectionId: string } =>
              // Honesty rule (no-fake-estimates law, product red team F2):
              // a score-less item was rendered as Crave Score 0 — a
              // fabricated number. A curated pick without a score has lost
              // its evidence since the list was built; drop it rather than
              // invent one. (The builder now skips these at build time; this
              // guards rows built before that fix.)
              item.connectionId != null && item.craveScore != null
          )
          .map(mapCuratedItemToFoodResult)
      : [];
  const restaurants =
    listType === 'restaurant'
      ? detail.items.filter((item) => item.craveScore != null).map(mapCuratedItemToRestaurantResult)
      : [];
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
      // The world constructor requires a request identity; the curated read has no
      // server searchRequestId, so the projection's identity is the build fact itself
      // (listId + builtAt) — deterministic, never invented.
      searchRequestId: `curated:${detail.listId}:${detail.builtAt}`,
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
