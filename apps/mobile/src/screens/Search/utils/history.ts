import type { RecentSearch, RecentlyViewedRestaurant } from '../../../services/search';

const normalizeHistoryLabel = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const buildRecentSearchLookup = (recentSearches: RecentSearch[]): Set<string> =>
  new Set(recentSearches.map((entry) => normalizeHistoryLabel(entry.queryText)));

export const filterRecentlyViewedByRecentSearches = (
  recentlyViewed: RecentlyViewedRestaurant[],
  recentSearches: RecentSearch[]
): RecentlyViewedRestaurant[] => {
  if (!recentlyViewed.length || !recentSearches.length) {
    return recentlyViewed;
  }
  const lookup = buildRecentSearchLookup(recentSearches);
  return recentlyViewed.filter(
    (item) => !lookup.has(normalizeHistoryLabel(item.restaurantName))
  );
};
