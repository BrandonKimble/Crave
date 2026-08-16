import type { QueryPlan, RestaurantResult, SearchResponse } from '../../../types';

const extractTargetRestaurantId = (placeFilters?: QueryPlan['placeFilters']): string | null => {
  if (!placeFilters?.length) {
    return null;
  }
  const ids = new Set<string>();
  for (const filter of placeFilters) {
    if (filter.entityType !== 'place') {
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
  if (!response?.places?.length) {
    return null;
  }
  const targetedId = extractTargetRestaurantId(response.plan?.placeFilters);
  if (targetedId) {
    const match = response.places.find((restaurant) => restaurant.placeId === targetedId);
    if (match) {
      return match;
    }
  }
  if (response.format === 'single_list' && response.places.length === 1) {
    return response.places[0];
  }
  return null;
};
