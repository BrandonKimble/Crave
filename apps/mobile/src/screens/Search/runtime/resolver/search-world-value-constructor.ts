// The WORLD-VALUE CONSTRUCTOR (S3 edit map §1 step 8): a page-1 SearchResponse becomes a
// complete, presentation-ready SearchWorldValue — normalized metadata, both-tab marker
// projections (same inputs, same resultsKey, so a tab toggle finds its catalog
// precomputed), the root-bus results patch, and pagination meta. This is the response
// owner's commit-projection logic re-homed as the resolver's canonical constructor; the
// owner's inline copy dies with its file in S3d.

import type { Coordinate, MapBounds, SearchResponse } from '../../../../types';
import type { SearchQueryIdentity } from '../shared/search-desired-state-contract';
import { computeMarkerPipeline, type MarkerPipelineResult } from '../map/compute-marker-pipeline';
import type {
  SearchMountedResultsMarkerProjection,
  SearchMountedResultsMarkerProjectionByTab,
} from '../shared/search-mounted-results-data-store';
import { buildResultsIdentityKey } from '../shared/results-identity-key';
import { mergeSearchResponses } from '../../utils/merge';
import type { SearchWorldValue } from './search-world-presentation-seam';

type ResultsActiveTab = 'dishes' | 'restaurants';

const MARKER_PIPELINE_CACHE_LIMIT = 12;
const markerPipelineCache = new Map<string, MarkerPipelineResult>();

const normalizeCacheNumber = (value: unknown): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(5) : 'null';

const buildLocationCacheKey = (
  location:
    | {
        latitude?: number | null;
        longitude?: number | null;
        lat?: number | null;
        lng?: number | null;
      }
    | null
    | undefined
): string =>
  location == null
    ? 'none'
    : `${normalizeCacheNumber(location.latitude ?? location.lat)}:${normalizeCacheNumber(
        location.longitude ?? location.lng
      )}`;

const retainMarkerPipelineCacheEntry = (cacheKey: string, result: MarkerPipelineResult): void => {
  markerPipelineCache.delete(cacheKey);
  markerPipelineCache.set(cacheKey, result);
  while (markerPipelineCache.size > MARKER_PIPELINE_CACHE_LIMIT) {
    const firstKey = markerPipelineCache.keys().next().value;
    if (typeof firstKey !== 'string') {
      break;
    }
    markerPipelineCache.delete(firstKey);
  }
};

export const constructSearchWorldValue = (args: {
  response: SearchResponse;
  /** The world's structured identity — travels on the value into the mounted snapshot. */
  queryIdentity: SearchQueryIdentity;
  activeTab: ResultsActiveTab;
  bounds: MapBounds | null;
  userLocation: Coordinate | null;
  /** Shortcut page-1 identities narrow the root-bus patch (route identity preserved by
   *  the route lane); every other mode publishes the full patch — the exact
   *  preserveRouteIdentity rule from the response owner. */
  preserveRouteIdentity: boolean;
  /** Pagination append: merge the landed page into the world's committed response —
   *  the value VERSIONS under one identity (the cache bumps worldId@vN). */
  appendTo?: {
    baseResponse: SearchResponse;
    targetPage: number;
    prevIsPaginationExhausted: boolean;
  };
}): SearchWorldValue => {
  const {
    response,
    queryIdentity,
    activeTab,
    bounds,
    userLocation,
    preserveRouteIdentity,
    appendTo,
  } = args;
  const searchRequestId = response.metadata?.searchRequestId;
  if (typeof searchRequestId !== 'string' || searchRequestId.length === 0) {
    throw new Error('Search response missing required metadata.searchRequestId');
  }
  const isAppend = appendTo != null;
  const merged = isAppend ? mergeSearchResponses(appendTo.baseResponse, response, true) : response;
  const page = isAppend
    ? appendTo.targetPage
    : typeof response.metadata?.page === 'number' && response.metadata.page > 0
      ? response.metadata.page
      : 1;
  const committedResponse: SearchResponse =
    merged.metadata?.page === page && merged.metadata?.searchRequestId === searchRequestId
      ? merged
      : { ...merged, metadata: { ...merged.metadata, page, searchRequestId } };
  const dishes = committedResponse.dishes ?? [];
  const restaurants = committedResponse.restaurants ?? [];
  const totalFoodResults =
    typeof committedResponse.metadata?.totalFoodResults === 'number'
      ? committedResponse.metadata.totalFoodResults
      : 'na';
  const totalRestaurantResults =
    typeof committedResponse.metadata?.totalRestaurantResults === 'number'
      ? committedResponse.metadata.totalRestaurantResults
      : 'na';
  const resultsIdentityKey = buildResultsIdentityKey({
    searchRequestId,
    page,
    dishCount: dishes.length,
    restaurantCount: restaurants.length,
    totalFoodResults,
    totalRestaurantResults,
  });

  const computeProjectionForTab = (
    tab: ResultsActiveTab
  ): SearchMountedResultsMarkerProjection | null => {
    const axisIsEmpty = tab === 'dishes' ? dishes.length === 0 : restaurants.length === 0;
    if (axisIsEmpty && tab !== activeTab) {
      // Response lacks this axis (entity/restaurant-only searches): no sibling precompute.
      return null;
    }
    const restaurantKey = restaurants
      .map((restaurant) => {
        const locationList = Array.isArray(restaurant.locations) ? restaurant.locations : [];
        const displayLocation =
          restaurant.displayLocation ??
          locationList.find(
            (location) =>
              typeof location.latitude === 'number' && typeof location.longitude === 'number'
          );
        return [
          restaurant.restaurantId,
          restaurant.rank ?? 'na',
          restaurant.craveScore ?? 'na',
          buildLocationCacheKey(displayLocation),
        ].join(':');
      })
      .join('|');
    const dishKey = dishes
      .map((dish) =>
        [
          dish.foodId,
          dish.restaurantId,
          dish.craveScore ?? 'na',
          dish.restaurantCraveScore ?? 'na',
          buildLocationCacheKey({
            latitude: dish.restaurantLatitude,
            longitude: dish.restaurantLongitude,
          }),
        ].join(':')
      )
      .join('|');
    const cacheKey = [
      `tab:${tab}`,
      `bounds:${buildLocationCacheKey(bounds?.northEast)}:${buildLocationCacheKey(bounds?.southWest)}`,
      `user:${buildLocationCacheKey(userLocation)}`,
      `restaurants:${restaurants.length}:${restaurantKey}`,
      `dishes:${dishes.length}:${dishKey}`,
    ].join('::');
    const cached = markerPipelineCache.get(cacheKey) ?? null;
    const pipelineResult =
      cached != null
        ? { ...cached, resultsKey: searchRequestId }
        : computeMarkerPipeline({
            restaurants,
            dishes,
            activeTab: tab,
            selectedRestaurantId: null,
            bounds,
            userLocation,
            searchRequestId,
          });
    if (cached == null) {
      retainMarkerPipelineCacheEntry(cacheKey, pipelineResult);
    }
    return {
      activeTab: tab,
      catalog: pipelineResult.catalog,
      canonicalRestaurantRankById: pipelineResult.canonicalRestaurantRankById,
      primaryCount: pipelineResult.primaryCount,
      restaurantsById: pipelineResult.restaurantsById,
      resultsKey: pipelineResult.resultsKey,
    };
  };

  const markerProjectionByTab: SearchMountedResultsMarkerProjectionByTab = {
    dishes: computeProjectionForTab('dishes'),
    restaurants: computeProjectionForTab('restaurants'),
  };

  const totalFood = committedResponse.metadata.totalFoodResults ?? dishes.length;
  const totalRestaurants = committedResponse.metadata.totalRestaurantResults ?? restaurants.length;
  const hasMoreFood = dishes.length < totalFood;
  const hasMoreRestaurants =
    committedResponse.format === 'dual_list' ? restaurants.length < totalRestaurants : false;
  // Append exhaustion (the response-owner rule): exhausted when the page grew nothing
  // or both axes report drained — sticky across appends.
  const prevFoodCount = appendTo?.baseResponse.dishes?.length ?? 0;
  const prevRestaurantCount = appendTo?.baseResponse.restaurants?.length ?? 0;
  const appendExhausted =
    isAppend &&
    (!(dishes.length > prevFoodCount || restaurants.length > prevRestaurantCount) ||
      (!hasMoreFood && !hasMoreRestaurants));
  const isPaginationExhausted = isAppend
    ? appendExhausted || (appendTo?.prevIsPaginationExhausted ?? false)
    : false;

  return {
    committedResponse,
    queryIdentity,
    markerProjectionByTab,
    resultsIdentityKey,
    searchRequestId,
    rootBusResultsPatch: {
      resultsIdentityCandidateKey: resultsIdentityKey,
      resultsDishCount: dishes.length,
      resultsRestaurantCount: restaurants.length,
      ...(preserveRouteIdentity ? { resultsRequestKey: searchRequestId, resultsPage: page } : {}),
    },
    paginationMeta: {
      page,
      hasMoreFood,
      hasMoreRestaurants,
      isPaginationExhausted,
      canLoadMore: !isPaginationExhausted && (hasMoreFood || hasMoreRestaurants),
      totalRestaurantResults: totalRestaurants,
      totalFoodResults: totalFood,
    },
    coverageByTab: {},
  };
};
