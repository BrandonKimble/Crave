import React from 'react';

import { captureHandledError } from '../../../observability/crash-reporting';
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

// F1053(b) — request-dedupe + load-once state lives in searchHistoryStore now (it is state
// ABOUT the data). Read/written imperatively via getState()/setState() from the load
// callbacks below — never through a reactive selector — so nothing subscribes to it and
// render timing is byte-identical to the module-level `let`s these replaced. The sign-out
// reset is one `resetHistory()` call (they are part of the store's defaultState).
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
        useSearchHistoryStore.setState({ hasLoadedRecent: false });
        return;
      }

      if (!force && useSearchHistoryStore.getState().hasLoadedRecent) {
        return;
      }

      const inFlight = useSearchHistoryStore.getState().recentHistoryRequest;
      if (inFlight) {
        return inFlight;
      }

      const request = (async () => {
        setIsRecentLoading(true);
        try {
          const history = await searchService.recentHistory(RECENT_HISTORY_LIMIT);
          setRecentSearches(history);
          useSearchHistoryStore.setState({ hasLoadedRecent: true });
        } catch (err) {
          // F838 (2026-08-03): this failure used to reach NOBODY — the request passes
          // `suppressErrorLog`, so the interceptor stays quiet, and this `logger.warn` is
          // the only trace. Meanwhile the rendered result is "you have no history", which
          // is BYTE-IDENTICAL to a brand-new account: the user cannot tell a broken read
          // from an empty one, and neither could we. The failure now reaches the
          // crash-reporting seam.
          captureHandledError(err, { seam: 'history:recent-searches' });
          logger.warn('Unable to load recent searches', {
            message: err instanceof Error ? err.message : 'unknown error',
          });
        } finally {
          setIsRecentLoading(false);
          useSearchHistoryStore.setState({ recentHistoryRequest: null });
        }
      })();

      useSearchHistoryStore.setState({ recentHistoryRequest: request });
      return request;
    },
    [isSignedIn, setIsRecentLoading, setRecentSearches]
  );

  const loadRecentlyViewedRestaurants = React.useCallback(
    async ({ force = false } = {}) => {
      if (!isSignedIn) {
        setIsRecentlyViewedLoading(false);
        setRecentlyViewedRestaurants([]);
        useSearchHistoryStore.setState({ hasLoadedRecentlyViewed: false });
        return;
      }

      if (!force && useSearchHistoryStore.getState().hasLoadedRecentlyViewed) {
        return;
      }

      const inFlight = useSearchHistoryStore.getState().recentlyViewedRequest;
      if (inFlight) {
        return inFlight;
      }

      const request = (async () => {
        setIsRecentlyViewedLoading(true);
        try {
          const items = await searchService.recentlyViewedRestaurants(RECENTLY_VIEWED_LIMIT);
          setRecentlyViewedRestaurants(items);
          useSearchHistoryStore.setState({ hasLoadedRecentlyViewed: true });
        } catch (err) {
          // F838 (2026-08-03): this failure used to reach NOBODY — the request passes
          // `suppressErrorLog`, so the interceptor stays quiet, and this `logger.warn` is
          // the only trace. Meanwhile the rendered result is "you have no history", which
          // is BYTE-IDENTICAL to a brand-new account: the user cannot tell a broken read
          // from an empty one, and neither could we. The failure now reaches the
          // crash-reporting seam.
          captureHandledError(err, { seam: 'history:recently-viewed-restaurants' });
          logger.warn('Unable to load recently viewed restaurants', {
            message: err instanceof Error ? err.message : 'unknown error',
          });
        } finally {
          setIsRecentlyViewedLoading(false);
          useSearchHistoryStore.setState({ recentlyViewedRequest: null });
        }
      })();

      useSearchHistoryStore.setState({ recentlyViewedRequest: request });
      return request;
    },
    [isSignedIn, setIsRecentlyViewedLoading, setRecentlyViewedRestaurants]
  );

  const loadRecentlyViewedFoods = React.useCallback(
    async ({ force = false } = {}) => {
      if (!isSignedIn) {
        setIsRecentlyViewedFoodsLoading(false);
        setRecentlyViewedFoods([]);
        useSearchHistoryStore.setState({ hasLoadedRecentlyViewedFoods: false });
        return;
      }

      if (!force && useSearchHistoryStore.getState().hasLoadedRecentlyViewedFoods) {
        return;
      }

      const inFlight = useSearchHistoryStore.getState().recentlyViewedFoodsRequest;
      if (inFlight) {
        return inFlight;
      }

      const request = (async () => {
        setIsRecentlyViewedFoodsLoading(true);
        try {
          const items = await searchService.recentlyViewedFoods(RECENTLY_VIEWED_LIMIT);
          setRecentlyViewedFoods(items);
          useSearchHistoryStore.setState({ hasLoadedRecentlyViewedFoods: true });
        } catch (err) {
          // F838 (2026-08-03): this failure used to reach NOBODY — the request passes
          // `suppressErrorLog`, so the interceptor stays quiet, and this `logger.warn` is
          // the only trace. Meanwhile the rendered result is "you have no history", which
          // is BYTE-IDENTICAL to a brand-new account: the user cannot tell a broken read
          // from an empty one, and neither could we. The failure now reaches the
          // crash-reporting seam.
          captureHandledError(err, { seam: 'history:recently-viewed-foods' });
          logger.warn('Unable to load recently viewed dishes', {
            message: err instanceof Error ? err.message : 'unknown error',
          });
        } finally {
          setIsRecentlyViewedFoodsLoading(false);
          useSearchHistoryStore.setState({ recentlyViewedFoodsRequest: null });
        }
      })();

      useSearchHistoryStore.setState({ recentlyViewedFoodsRequest: request });
      return request;
    },
    [isSignedIn, setIsRecentlyViewedFoodsLoading, setRecentlyViewedFoods]
  );

  React.useEffect(() => {
    if (isSignedIn) {
      return;
    }
    // F1053(b): resetHistory() now clears the dedupe promises + load-once flags too (they
    // are part of the store's defaultState), so the sign-out reset is one call instead of
    // seven hand-kept assignments. The per-instance autoLoad ref stays local to the hook.
    resetHistory();
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
