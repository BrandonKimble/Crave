import { create } from 'zustand';

import type {
  RecentSearch,
  RecentlyViewedFood,
  RecentlyViewedRestaurant,
} from '../services/search';
import { RECENT_HISTORY_LIMIT, RECENTLY_VIEWED_LIMIT } from '../constants/searchHistory';

type SearchHistoryState = {
  recentSearches: RecentSearch[];
  isRecentLoading: boolean;
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  isRecentlyViewedLoading: boolean;
  recentlyViewedFoods: RecentlyViewedFood[];
  isRecentlyViewedFoodsLoading: boolean;
  // F1053(b) — request-dedupe + load-once state moved here from six module-level `let`s in
  // use-search-history.ts. These are STATE ABOUT THE DATA (an in-flight promise, a
  // loaded-once flag), so they live next to the data they describe — and the sign-out reset
  // is now ONE `resetHistory()` call (they are part of `defaultState`) instead of the hook
  // having to remember to null all six by hand. Accessed imperatively via
  // getState()/setState() from the hook's load callbacks, never through a reactive selector,
  // so no component subscribes to them and render timing is unchanged.
  recentHistoryRequest: Promise<void> | null;
  recentlyViewedRequest: Promise<void> | null;
  recentlyViewedFoodsRequest: Promise<void> | null;
  hasLoadedRecent: boolean;
  hasLoadedRecentlyViewed: boolean;
  hasLoadedRecentlyViewedFoods: boolean;
  setRecentSearches: (value: RecentSearch[]) => void;
  setIsRecentLoading: (value: boolean) => void;
  setRecentlyViewedRestaurants: (value: RecentlyViewedRestaurant[]) => void;
  setIsRecentlyViewedLoading: (value: boolean) => void;
  setRecentlyViewedFoods: (value: RecentlyViewedFood[]) => void;
  setIsRecentlyViewedFoodsLoading: (value: boolean) => void;
  updateLocalRecentSearches: (value: string | RecentSearchInput) => void;
  trackRecentlyViewedRestaurant: (placeId: string, placeName: string) => void;
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
  itemId: string;
  itemName: string;
  placeId: string;
  placeName: string;
  statusPreview?: RecentlyViewedFood['statusPreview'] | null;
};

const defaultState: {
  recentSearches: RecentSearch[];
  isRecentLoading: boolean;
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  isRecentlyViewedLoading: boolean;
  recentlyViewedFoods: RecentlyViewedFood[];
  isRecentlyViewedFoodsLoading: boolean;
  recentHistoryRequest: Promise<void> | null;
  recentlyViewedRequest: Promise<void> | null;
  recentlyViewedFoodsRequest: Promise<void> | null;
  hasLoadedRecent: boolean;
  hasLoadedRecentlyViewed: boolean;
  hasLoadedRecentlyViewedFoods: boolean;
} = {
  recentSearches: [],
  isRecentLoading: false,
  recentlyViewedRestaurants: [],
  isRecentlyViewedLoading: false,
  recentlyViewedFoods: [],
  isRecentlyViewedFoodsLoading: false,
  recentHistoryRequest: null,
  recentlyViewedRequest: null,
  recentlyViewedFoodsRequest: null,
  hasLoadedRecent: false,
  hasLoadedRecentlyViewed: false,
  hasLoadedRecentlyViewedFoods: false,
};

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
      const selectedEntityId = typeof value === 'string' ? null : (value.selectedEntityId ?? null);
      const selectedEntityType =
        typeof value === 'string' ? null : (value.selectedEntityType ?? null);
      const statusPreview = typeof value === 'string' ? null : (value.statusPreview ?? null);
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
  trackRecentlyViewedRestaurant: (placeId, placeName) =>
    set((state) => {
      const existing = state.recentlyViewedRestaurants.find((item) => item.placeId === placeId);
      const next: RecentlyViewedRestaurant = {
        placeId,
        placeName,
        city: existing?.city ?? null,
        region: existing?.region ?? null,
        lastViewedAt: new Date().toISOString(),
        viewCount: existing ? existing.viewCount + 1 : 1,
        statusPreview: existing?.statusPreview ?? null,
      };
      const withoutMatch = state.recentlyViewedRestaurants.filter(
        (item) => item.placeId !== placeId
      );
      return {
        ...state,
        recentlyViewedRestaurants: [next, ...withoutMatch].slice(0, RECENTLY_VIEWED_LIMIT),
      };
    }),
  trackRecentlyViewedFood: (value) =>
    set((state) => {
      const existing = state.recentlyViewedFoods.find(
        (item) => item.connectionId === value.connectionId
      );
      const next: RecentlyViewedFood = {
        connectionId: value.connectionId,
        itemId: value.itemId,
        itemName: value.itemName,
        placeId: value.placeId,
        placeName: value.placeName,
        lastViewedAt: new Date().toISOString(),
        viewCount: existing ? existing.viewCount + 1 : 1,
        statusPreview: value.statusPreview ?? existing?.statusPreview ?? null,
      };
      const withoutMatch = state.recentlyViewedFoods.filter(
        (item) => item.connectionId !== value.connectionId
      );
      return {
        ...state,
        recentlyViewedFoods: [next, ...withoutMatch].slice(0, RECENTLY_VIEWED_LIMIT),
      };
    }),
  resetHistory: () => set({ ...defaultState }),
}));
