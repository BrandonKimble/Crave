import React from 'react';

import { logger } from '../../../utils';
import {
  searchService,
  type RecentSearch,
  type RecentlyViewedFood,
  type RecentlyViewedRestaurant,
} from '../../../services/search';
import { RECENT_HISTORY_LIMIT, RECENTLY_VIEWED_LIMIT } from '../../../constants/searchHistory';
import { useSearchHistoryStore } from '../../../store/searchHistoryStore';

type UseSearchHistoryOptions = {
  isSignedIn: boolean;
  autoLoad?: boolean;
};

type UseSearchHistoryResult = {
  recentSearches: RecentSearch[];
  isRecentLoading: boolean;
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  isRecentlyViewedLoading: boolean;
  recentlyViewedFoods: RecentlyViewedFood[];
  isRecentlyViewedFoodsLoading: boolean;
  loadRecentHistory: (options?: { force?: boolean }) => Promise<void>;
  loadRecentlyViewedRestaurants: (options?: { force?: boolean }) => Promise<void>;
  loadRecentlyViewedFoods: (options?: { force?: boolean }) => Promise<void>;
  updateLocalRecentSearches: (value: string | LocalRecentSearchInput) => void;
  trackRecentlyViewedRestaurant: (restaurantId: string, restaurantName: string) => void;
  trackRecentlyViewedFood: (value: TrackRecentlyViewedFoodInput) => void;
};

type LocalRecentSearchInput = {
  queryText: string;
  selectedEntityId?: string | null;
  selectedEntityType?: RecentSearch['selectedEntityType'] | null;
  statusPreview?: RecentSearch['statusPreview'] | null;
};

type TrackRecentlyViewedFoodInput = Pick<
  RecentlyViewedFood,
  'connectionId' | 'foodId' | 'foodName' | 'restaurantId' | 'restaurantName' | 'statusPreview'
>;

let recentHistoryRequest: Promise<void> | null = null;
let recentlyViewedRequest: Promise<void> | null = null;
let recentlyViewedFoodsRequest: Promise<void> | null = null;
let hasLoadedRecent = false;
let hasLoadedRecentlyViewed = false;
let hasLoadedRecentlyViewedFoods = false;

const useSearchHistory = ({
  isSignedIn,
  autoLoad = true,
}: UseSearchHistoryOptions): UseSearchHistoryResult => {
  const recentSearches = useSearchHistoryStore((state) => state.recentSearches);
  const isRecentLoading = useSearchHistoryStore((state) => state.isRecentLoading);
  const recentlyViewedRestaurants = useSearchHistoryStore(
    (state) => state.recentlyViewedRestaurants
  );
  const isRecentlyViewedLoading = useSearchHistoryStore((state) => state.isRecentlyViewedLoading);
  const recentlyViewedFoods = useSearchHistoryStore((state) => state.recentlyViewedFoods);
  const isRecentlyViewedFoodsLoading = useSearchHistoryStore(
    (state) => state.isRecentlyViewedFoodsLoading
  );
  const setRecentSearches = useSearchHistoryStore((state) => state.setRecentSearches);
  const setIsRecentLoading = useSearchHistoryStore((state) => state.setIsRecentLoading);
  const setRecentlyViewedRestaurants = useSearchHistoryStore(
    (state) => state.setRecentlyViewedRestaurants
  );
  const setIsRecentlyViewedLoading = useSearchHistoryStore(
    (state) => state.setIsRecentlyViewedLoading
  );
  const setRecentlyViewedFoods = useSearchHistoryStore((state) => state.setRecentlyViewedFoods);
  const setIsRecentlyViewedFoodsLoading = useSearchHistoryStore(
    (state) => state.setIsRecentlyViewedFoodsLoading
  );
  const updateLocalRecentSearches = useSearchHistoryStore(
    (state) => state.updateLocalRecentSearches
  );
  const trackRecentlyViewedRestaurant = useSearchHistoryStore(
    (state) => state.trackRecentlyViewedRestaurant
  );
  const trackRecentlyViewedFood = useSearchHistoryStore((state) => state.trackRecentlyViewedFood);
  const resetHistory = useSearchHistoryStore((state) => state.resetHistory);
  const autoLoadTriggeredRef = React.useRef(false);

  const loadRecentHistory = React.useCallback(
    async ({ force = false } = {}) => {
      if (!isSignedIn) {
        setIsRecentLoading(false);
        setRecentSearches([]);
        hasLoadedRecent = false;
        return;
      }

      if (!force && hasLoadedRecent) {
        return;
      }

      if (recentHistoryRequest) {
        return recentHistoryRequest;
      }

      const request = (async () => {
        setIsRecentLoading(true);
        try {
          const history = await searchService.recentHistory(RECENT_HISTORY_LIMIT);
          setRecentSearches(history);
          hasLoadedRecent = true;
        } catch (err) {
          logger.warn('Unable to load recent searches', {
            message: err instanceof Error ? err.message : 'unknown error',
          });
        } finally {
          setIsRecentLoading(false);
          recentHistoryRequest = null;
        }
      })();

      recentHistoryRequest = request;
      return request;
    },
    [isSignedIn, setIsRecentLoading, setRecentSearches]
  );

  const loadRecentlyViewedRestaurants = React.useCallback(
    async ({ force = false } = {}) => {
      if (!isSignedIn) {
        setIsRecentlyViewedLoading(false);
        setRecentlyViewedRestaurants([]);
        hasLoadedRecentlyViewed = false;
        return;
      }

      if (!force && hasLoadedRecentlyViewed) {
        return;
      }

      if (recentlyViewedRequest) {
        return recentlyViewedRequest;
      }

      const request = (async () => {
        setIsRecentlyViewedLoading(true);
        try {
          const items = await searchService.recentlyViewedRestaurants(RECENTLY_VIEWED_LIMIT);
          setRecentlyViewedRestaurants(items);
          hasLoadedRecentlyViewed = true;
        } catch (err) {
          logger.warn('Unable to load recently viewed restaurants', {
            message: err instanceof Error ? err.message : 'unknown error',
          });
        } finally {
          setIsRecentlyViewedLoading(false);
          recentlyViewedRequest = null;
        }
      })();

      recentlyViewedRequest = request;
      return request;
    },
    [isSignedIn, setIsRecentlyViewedLoading, setRecentlyViewedRestaurants]
  );

  const loadRecentlyViewedFoods = React.useCallback(
    async ({ force = false } = {}) => {
      if (!isSignedIn) {
        setIsRecentlyViewedFoodsLoading(false);
        setRecentlyViewedFoods([]);
        hasLoadedRecentlyViewedFoods = false;
        return;
      }

      if (!force && hasLoadedRecentlyViewedFoods) {
        return;
      }

      if (recentlyViewedFoodsRequest) {
        return recentlyViewedFoodsRequest;
      }

      const request = (async () => {
        setIsRecentlyViewedFoodsLoading(true);
        try {
          const items = await searchService.recentlyViewedFoods(RECENTLY_VIEWED_LIMIT);
          setRecentlyViewedFoods(items);
          hasLoadedRecentlyViewedFoods = true;
        } catch (err) {
          logger.warn('Unable to load recently viewed dishes', {
            message: err instanceof Error ? err.message : 'unknown error',
          });
        } finally {
          setIsRecentlyViewedFoodsLoading(false);
          recentlyViewedFoodsRequest = null;
        }
      })();

      recentlyViewedFoodsRequest = request;
      return request;
    },
    [isSignedIn, setIsRecentlyViewedFoodsLoading, setRecentlyViewedFoods]
  );

  React.useEffect(() => {
    if (isSignedIn) {
      return;
    }
    resetHistory();
    recentHistoryRequest = null;
    recentlyViewedRequest = null;
    recentlyViewedFoodsRequest = null;
    hasLoadedRecent = false;
    hasLoadedRecentlyViewed = false;
    hasLoadedRecentlyViewedFoods = false;
    autoLoadTriggeredRef.current = false;
  }, [isSignedIn, resetHistory]);

  React.useEffect(() => {
    if (!autoLoad || !isSignedIn || autoLoadTriggeredRef.current) {
      return;
    }
    autoLoadTriggeredRef.current = true;
    void loadRecentHistory();
    void loadRecentlyViewedRestaurants();
    void loadRecentlyViewedFoods();
  }, [
    autoLoad,
    isSignedIn,
    loadRecentHistory,
    loadRecentlyViewedFoods,
    loadRecentlyViewedRestaurants,
  ]);

  return {
    recentSearches,
    isRecentLoading,
    recentlyViewedRestaurants,
    isRecentlyViewedLoading,
    recentlyViewedFoods,
    isRecentlyViewedFoodsLoading,
    loadRecentHistory,
    loadRecentlyViewedRestaurants,
    loadRecentlyViewedFoods,
    updateLocalRecentSearches,
    trackRecentlyViewedRestaurant,
    trackRecentlyViewedFood,
  };
};

export default useSearchHistory;
