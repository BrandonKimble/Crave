import React from 'react';

type UseSuggestionHistoryBufferArgs<TRecentSearchUpsert> = {
  isSuggestionPanelActive: boolean;
  isSuggestionPanelVisible: boolean;
  updateLocalRecentSearches: (value: TRecentSearchUpsert) => void;
  trackRecentlyViewedRestaurant: (restaurantId: string, restaurantName: string) => void;
};

type UseSuggestionHistoryBufferResult<TRecentSearchUpsert> = {
  deferRecentSearchUpsert: (value: TRecentSearchUpsert) => void;
  deferRecentlyViewedTrack: (restaurantId: string, restaurantName: string) => void;
};

export const useSuggestionHistoryBuffer = <TRecentSearchUpsert>({
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
  updateLocalRecentSearches,
  trackRecentlyViewedRestaurant,
}: UseSuggestionHistoryBufferArgs<TRecentSearchUpsert>): UseSuggestionHistoryBufferResult<TRecentSearchUpsert> => {
  const pendingRecentSearchUpsertsRef = React.useRef<TRecentSearchUpsert[]>([]);
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
    (value: TRecentSearchUpsert) => {
      if (isSuggestionPanelActive || isSuggestionPanelVisible) {
        pendingRecentSearchUpsertsRef.current.push(value);
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
        pendingRecentlyViewedTrackRef.current.push({ restaurantId, restaurantName });
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
