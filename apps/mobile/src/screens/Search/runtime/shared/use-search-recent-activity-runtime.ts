import React from 'react';

import type { RecentSearch } from '../../../../services/search';
import type useSearchHistory from '../../hooks/use-search-history';

type SearchHistoryRuntime = Pick<
  ReturnType<typeof useSearchHistory>,
  'updateLocalRecentSearches' | 'trackRecentlyViewedRestaurant'
>;

type UseSearchRecentActivityRuntimeArgs = {
  isSuggestionPanelActive: boolean;
  isSuggestionPanelVisible: boolean;
  searchHistoryRuntime: SearchHistoryRuntime;
};

export const useSearchRecentActivityRuntime = ({
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
  searchHistoryRuntime,
}: UseSearchRecentActivityRuntimeArgs) => {
  const { updateLocalRecentSearches, trackRecentlyViewedRestaurant } = searchHistoryRuntime;

  const pendingRecentSearchUpsertsRef = React.useRef<RecentSearch[]>([]);
  const flushPendingRecentSearchUpserts = React.useCallback(() => {
    if (pendingRecentSearchUpsertsRef.current.length === 0) {
      return;
    }
    const pending = pendingRecentSearchUpsertsRef.current.splice(0);
    pending.forEach((value) => updateLocalRecentSearches(value));
  }, [updateLocalRecentSearches]);

  React.useEffect(() => {
    if (isSuggestionPanelActive || isSuggestionPanelVisible) {
      return;
    }
    flushPendingRecentSearchUpserts();
  }, [flushPendingRecentSearchUpserts, isSuggestionPanelActive, isSuggestionPanelVisible]);

  const deferRecentSearchUpsert = React.useCallback(
    (value: string | RecentSearch) => {
      if (isSuggestionPanelActive || isSuggestionPanelVisible) {
        pendingRecentSearchUpsertsRef.current.push(
          typeof value === 'string' ? { queryText: value } : value
        );
        return;
      }
      updateLocalRecentSearches(value);
    },
    [isSuggestionPanelActive, isSuggestionPanelVisible, updateLocalRecentSearches]
  );

  const pendingRecentlyViewedTrackRef = React.useRef<
    Array<{ restaurantId: string; restaurantName: string }>
  >([]);
  const flushPendingRecentlyViewedTrack = React.useCallback(() => {
    if (pendingRecentlyViewedTrackRef.current.length === 0) {
      return;
    }
    const pending = pendingRecentlyViewedTrackRef.current.splice(0);
    pending.forEach(({ restaurantId, restaurantName }) =>
      trackRecentlyViewedRestaurant(restaurantId, restaurantName)
    );
  }, [trackRecentlyViewedRestaurant]);

  React.useEffect(() => {
    if (isSuggestionPanelActive || isSuggestionPanelVisible) {
      return;
    }
    flushPendingRecentlyViewedTrack();
  }, [flushPendingRecentlyViewedTrack, isSuggestionPanelActive, isSuggestionPanelVisible]);

  const deferRecentlyViewedTrack = React.useCallback(
    (restaurantId: string, restaurantName: string) => {
      if (isSuggestionPanelActive || isSuggestionPanelVisible) {
        pendingRecentlyViewedTrackRef.current.push({
          restaurantId,
          restaurantName,
        });
        return;
      }
      trackRecentlyViewedRestaurant(restaurantId, restaurantName);
    },
    [isSuggestionPanelActive, isSuggestionPanelVisible, trackRecentlyViewedRestaurant]
  );

  return {
    deferRecentSearchUpsert,
    deferRecentlyViewedTrack,
  };
};
