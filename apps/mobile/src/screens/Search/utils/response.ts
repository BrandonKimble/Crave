import type { QueryPlan, RestaurantResult, SearchResponse } from '../../../types';

const extractTargetRestaurantId = (
  restaurantFilters?: QueryPlan['restaurantFilters']
): string | null => {
  if (!restaurantFilters?.length) {
    return null;
  }
  const ids = new Set<string>();
  for (const filter of restaurantFilters) {
    if (filter.entityType !== 'restaurant') {
      continue;
    }
    for (const id of filter.entityIds || []) {
      if (typeof id === 'string' && id.trim()) {
        ids.add(id);
      }
    }
  }
  return ids.size === 1 ? Array.from(ids)[0] : null;
};

export const resolveSingleRestaurantCandidate = (
  response: SearchResponse | null
): RestaurantResult | null => {
  if (!response?.restaurants?.length) {
    return null;
  }
  const targetedId = extractTargetRestaurantId(response.plan?.restaurantFilters);
  if (targetedId) {
    const match = response.restaurants.find((restaurant) => restaurant.restaurantId === targetedId);
    if (match) {
      return match;
    }
  }
  if (response.format === 'single_list' && response.restaurants.length === 1) {
    return response.restaurants[0];
  }
  return null;
};
