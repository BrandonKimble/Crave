import React from 'react';

import { logger } from '../../../utils';
import { searchService, type RecentlyViewedRestaurant } from '../../../services/search';
import { RECENT_HISTORY_LIMIT } from '../constants/search';

const RECENTLY_VIEWED_LIMIT = 10;

type UseSearchHistoryOptions = {
  isSignedIn: boolean;
};

type UseSearchHistoryResult = {
  recentSearches: string[];
  isRecentLoading: boolean;
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  isRecentlyViewedLoading: boolean;
  loadRecentHistory: () => Promise<void>;
  loadRecentlyViewedRestaurants: () => Promise<void>;
  updateLocalRecentSearches: (value: string) => void;
  trackRecentlyViewedRestaurant: (restaurantId: string, restaurantName: string) => void;
};

const useSearchHistory = ({ isSignedIn }: UseSearchHistoryOptions): UseSearchHistoryResult => {
  const [recentSearches, setRecentSearches] = React.useState<string[]>([]);
  const [isRecentLoading, setIsRecentLoading] = React.useState(false);
  const [recentlyViewedRestaurants, setRecentlyViewedRestaurants] = React.useState<
    RecentlyViewedRestaurant[]
  >([]);
  const [isRecentlyViewedLoading, setIsRecentlyViewedLoading] = React.useState(false);
  const recentHistoryRequest = React.useRef<Promise<void> | null>(null);
  const recentlyViewedRequest = React.useRef<Promise<void> | null>(null);

  const loadRecentHistory = React.useCallback(async () => {
    if (!isSignedIn) {
      setIsRecentLoading(false);
      setRecentSearches([]);
      return;
    }

    if (recentHistoryRequest.current) {
      return recentHistoryRequest.current;
    }

    const request = (async () => {
      setIsRecentLoading(true);
      try {
        const history = await searchService.recentHistory(RECENT_HISTORY_LIMIT);
        setRecentSearches(history);
      } catch (err) {
        logger.warn('Unable to load recent searches', {
          message: err instanceof Error ? err.message : 'unknown error',
        });
      } finally {
        setIsRecentLoading(false);
        recentHistoryRequest.current = null;
      }
    })();

    recentHistoryRequest.current = request;
    return request;
  }, [isSignedIn]);

  const loadRecentlyViewedRestaurants = React.useCallback(async () => {
    if (!isSignedIn) {
      setIsRecentlyViewedLoading(false);
      setRecentlyViewedRestaurants([]);
      return;
    }

    if (recentlyViewedRequest.current) {
      return recentlyViewedRequest.current;
    }

    const request = (async () => {
      setIsRecentlyViewedLoading(true);
      try {
        const items = await searchService.recentlyViewedRestaurants(RECENTLY_VIEWED_LIMIT);
        setRecentlyViewedRestaurants(items);
      } catch (err) {
        logger.warn('Unable to load recently viewed restaurants', {
          message: err instanceof Error ? err.message : 'unknown error',
        });
      } finally {
        setIsRecentlyViewedLoading(false);
        recentlyViewedRequest.current = null;
      }
    })();

    recentlyViewedRequest.current = request;
    return request;
  }, [isSignedIn]);

  const updateLocalRecentSearches = React.useCallback((value: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return;
    }
    const normalized = trimmedValue.toLowerCase();
    setRecentSearches((prev) => {
      const withoutMatch = prev.filter((entry) => entry.toLowerCase() !== normalized);
      return [trimmedValue, ...withoutMatch].slice(0, RECENT_HISTORY_LIMIT);
    });
  }, []);

  const trackRecentlyViewedRestaurant = React.useCallback(
    (restaurantId: string, restaurantName: string) => {
      setRecentlyViewedRestaurants((prev) => {
        const existing = prev.find((item) => item.restaurantId === restaurantId);
        const next: RecentlyViewedRestaurant = {
          restaurantId,
          restaurantName,
          city: existing?.city ?? null,
          region: existing?.region ?? null,
          lastViewedAt: new Date().toISOString(),
          viewCount: existing ? existing.viewCount + 1 : 1,
        };
        const withoutMatch = prev.filter((item) => item.restaurantId !== restaurantId);
        return [next, ...withoutMatch].slice(0, RECENTLY_VIEWED_LIMIT);
      });
    },
    []
  );

  return {
    recentSearches,
    isRecentLoading,
    recentlyViewedRestaurants,
    isRecentlyViewedLoading,
    loadRecentHistory,
    loadRecentlyViewedRestaurants,
    updateLocalRecentSearches,
    trackRecentlyViewedRestaurant,
  };
};

export default useSearchHistory;
