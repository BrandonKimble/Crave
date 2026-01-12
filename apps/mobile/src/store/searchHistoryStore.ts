import { create } from 'zustand';

import type { RecentSearch, RecentlyViewedFood, RecentlyViewedRestaurant } from '../services/search';
import { RECENT_HISTORY_LIMIT, RECENTLY_VIEWED_LIMIT } from '../constants/searchHistory';

type SearchHistoryState = {
  recentSearches: RecentSearch[];
  isRecentLoading: boolean;
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  isRecentlyViewedLoading: boolean;
  recentlyViewedFoods: RecentlyViewedFood[];
  isRecentlyViewedFoodsLoading: boolean;
  setRecentSearches: (value: RecentSearch[]) => void;
  setIsRecentLoading: (value: boolean) => void;
  setRecentlyViewedRestaurants: (value: RecentlyViewedRestaurant[]) => void;
  setIsRecentlyViewedLoading: (value: boolean) => void;
  setRecentlyViewedFoods: (value: RecentlyViewedFood[]) => void;
  setIsRecentlyViewedFoodsLoading: (value: boolean) => void;
  updateLocalRecentSearches: (value: string | RecentSearchInput) => void;
  trackRecentlyViewedRestaurant: (restaurantId: string, restaurantName: string) => void;
  trackRecentlyViewedFood: (value: RecentlyViewedFoodInput) => void;
  resetHistory: () => void;
};

type RecentSearchInput = {
  queryText: string;
  selectedEntityId?: string | null;
  selectedEntityType?: RecentSearch['selectedEntityType'] | null;
  statusPreview?: RecentSearch['statusPreview'] | null;
};

type RecentlyViewedFoodInput = {
  connectionId: string;
  foodId: string;
  foodName: string;
  restaurantId: string;
  restaurantName: string;
  statusPreview?: RecentlyViewedFood['statusPreview'] | null;
};

const defaultState = {
  recentSearches: [] as RecentSearch[],
  isRecentLoading: false,
  recentlyViewedRestaurants: [] as RecentlyViewedRestaurant[],
  isRecentlyViewedLoading: false,
  recentlyViewedFoods: [] as RecentlyViewedFood[],
  isRecentlyViewedFoodsLoading: false,
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
  setRecentlyViewedFoods: (recentlyViewedFoods) => set({ recentlyViewedFoods }),
  setIsRecentlyViewedFoodsLoading: (isRecentlyViewedFoodsLoading) =>
    set({ isRecentlyViewedFoodsLoading }),
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
      const statusPreview = typeof value === 'string' ? null : value.statusPreview ?? null;
      const normalized = trimmedValue.toLowerCase();
      const withoutMatch = state.recentSearches.filter(
        (entry) => entry.queryText.toLowerCase() !== normalized
      );
      const next: RecentSearch = {
        queryText: trimmedValue,
        lastSearchedAt: new Date().toISOString(),
        selectedEntityId,
        selectedEntityType,
        statusPreview,
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
        statusPreview: existing?.statusPreview ?? null,
      };
      const withoutMatch = state.recentlyViewedRestaurants.filter(
        (item) => item.restaurantId !== restaurantId
      );
      return {
        ...state,
        recentlyViewedRestaurants: [next, ...withoutMatch].slice(0, RECENTLY_VIEWED_LIMIT),
      };
    }),
  trackRecentlyViewedFood: (value) =>
    set((state) => {
      const existing = state.recentlyViewedFoods.find((item) => item.connectionId === value.connectionId);
      const next: RecentlyViewedFood = {
        connectionId: value.connectionId,
        foodId: value.foodId,
        foodName: value.foodName,
        restaurantId: value.restaurantId,
        restaurantName: value.restaurantName,
        lastViewedAt: new Date().toISOString(),
        viewCount: existing ? existing.viewCount + 1 : 1,
        statusPreview: value.statusPreview ?? existing?.statusPreview ?? null,
      };
      const withoutMatch = state.recentlyViewedFoods.filter((item) => item.connectionId !== value.connectionId);
      return {
        ...state,
        recentlyViewedFoods: [next, ...withoutMatch].slice(0, RECENTLY_VIEWED_LIMIT),
      };
    }),
  resetHistory: () => set({ ...defaultState }),
}));
