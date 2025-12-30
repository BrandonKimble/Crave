import type { RecentSearch, RecentlyViewedRestaurant } from '../../../services/search';

const normalizeHistoryLabel = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const buildRecentSearchLookup = (
  recentSearches: RecentSearch[]
): { names: Set<string>; restaurantIds: Set<string> } => {
  const names = new Set<string>();
  const restaurantIds = new Set<string>();
  recentSearches.forEach((entry) => {
    names.add(normalizeHistoryLabel(entry.queryText));
    if (entry.selectedEntityType === 'restaurant' && entry.selectedEntityId) {
      restaurantIds.add(entry.selectedEntityId);
    }
  });
  return { names, restaurantIds };
};

export const filterRecentlyViewedByRecentSearches = (
  recentlyViewed: RecentlyViewedRestaurant[],
  recentSearches: RecentSearch[]
): RecentlyViewedRestaurant[] => {
  if (!recentlyViewed.length || !recentSearches.length) {
    return recentlyViewed;
  }
  const lookup = buildRecentSearchLookup(recentSearches);
  return recentlyViewed.filter((item) => {
    if (lookup.restaurantIds.has(item.restaurantId)) {
      return false;
    }
    return !lookup.names.has(normalizeHistoryLabel(item.restaurantName));
  });
};
