import { create } from 'zustand';

import type { RecentSearch, RecentlyViewedRestaurant } from '../services/search';
import { RECENT_HISTORY_LIMIT, RECENTLY_VIEWED_LIMIT } from '../constants/searchHistory';

type SearchHistoryState = {
  recentSearches: RecentSearch[];
  isRecentLoading: boolean;
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  isRecentlyViewedLoading: boolean;
  setRecentSearches: (value: RecentSearch[]) => void;
  setIsRecentLoading: (value: boolean) => void;
  setRecentlyViewedRestaurants: (value: RecentlyViewedRestaurant[]) => void;
  setIsRecentlyViewedLoading: (value: boolean) => void;
  updateLocalRecentSearches: (value: string | RecentSearchInput) => void;
  trackRecentlyViewedRestaurant: (restaurantId: string, restaurantName: string) => void;
  resetHistory: () => void;
};

type RecentSearchInput = {
  queryText: string;
  selectedEntityId?: string | null;
  selectedEntityType?: RecentSearch['selectedEntityType'] | null;
};

const defaultState = {
  recentSearches: [] as RecentSearch[],
  isRecentLoading: false,
  recentlyViewedRestaurants: [] as RecentlyViewedRestaurant[],
  isRecentlyViewedLoading: false,
} as const;

export const useSearchHistoryStore = create<SearchHistoryState>((set) => ({
  ...defaultState,
  setRecentSearches: (recentSearches) => set({ recentSearches }),
  setIsRecentLoading: (isRecentLoading) => set({ isRecentLoading }),
  setRecentlyViewedRestaurants: (recentlyViewedRestaurants) =>
    set({
      recentlyViewedRestaurants,
    }),
  setIsRecentlyViewedLoading: (isRecentlyViewedLoading) => set({ isRecentlyViewedLoading }),
  updateLocalRecentSearches: (value) =>
    set((state) => {
      const rawQuery = typeof value === 'string' ? value : value.queryText;
      const trimmedValue = rawQuery.trim();
      if (!trimmedValue) {
        return state;
      }
      const selectedEntityId = typeof value === 'string' ? null : value.selectedEntityId ?? null;
      const selectedEntityType =
        typeof value === 'string' ? null : value.selectedEntityType ?? null;
      const normalized = trimmedValue.toLowerCase();
      const withoutMatch = state.recentSearches.filter(
        (entry) => entry.queryText.toLowerCase() !== normalized
      );
      const next: RecentSearch = {
        queryText: trimmedValue,
        lastSearchedAt: new Date().toISOString(),
        selectedEntityId,
        selectedEntityType,
      };
      return {
        ...state,
        recentSearches: [next, ...withoutMatch].slice(0, RECENT_HISTORY_LIMIT),
      };
    }),
  trackRecentlyViewedRestaurant: (restaurantId, restaurantName) =>
    set((state) => {
      const existing = state.recentlyViewedRestaurants.find(
        (item) => item.restaurantId === restaurantId
      );
      const next: RecentlyViewedRestaurant = {
        restaurantId,
        restaurantName,
        city: existing?.city ?? null,
        region: existing?.region ?? null,
        lastViewedAt: new Date().toISOString(),
        viewCount: existing ? existing.viewCount + 1 : 1,
      };
      const withoutMatch = state.recentlyViewedRestaurants.filter(
        (item) => item.restaurantId !== restaurantId
      );
      return {
        ...state,
        recentlyViewedRestaurants: [next, ...withoutMatch].slice(0, RECENTLY_VIEWED_LIMIT),
      };
    }),
  resetHistory: () => set({ ...defaultState }),
}));
