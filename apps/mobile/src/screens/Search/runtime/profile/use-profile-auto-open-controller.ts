import React from 'react';

import type { RestaurantOverlayData } from '../../../../overlays/panels/RestaurantPanel';
import type { FoodResult, RestaurantResult } from '../../../../types';
import { resolveSingleRestaurantCandidate } from '../../utils/response';
import type { SearchRuntimeBus } from '../shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../shared/use-search-runtime-bus-selector';
import type { ProfileRuntimeController } from './profile-runtime-controller';

type HydratedRestaurantProfile = {
  restaurant: RestaurantResult;
  dishes: FoodResult[];
};

type UseProfileAutoOpenControllerArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  isSuggestionPanelActive: boolean;
  isSearchFocused: boolean;
  pendingRestaurantSelectionRef: React.MutableRefObject<{ restaurantId: string } | null>;
  submittedQuery: string;
  trimmedQuery: string;
  isRestaurantOverlayVisible: boolean;
  restaurantProfile: RestaurantOverlayData | null;
  restaurantProfileCacheRef: React.MutableRefObject<Map<string, HydratedRestaurantProfile>>;
  restaurantOverlayDismissHandledRef: React.MutableRefObject<boolean>;
  setRestaurantProfile: React.Dispatch<React.SetStateAction<RestaurantOverlayData | null>>;
  setRestaurantOverlayVisible: React.Dispatch<React.SetStateAction<boolean>>;
  profileRuntimeController: ProfileRuntimeController;
  lastAutoOpenKeyRef: React.MutableRefObject<string | null>;
};

export const useProfileAutoOpenController = ({
  searchRuntimeBus,
  isSuggestionPanelActive,
  isSearchFocused,
  pendingRestaurantSelectionRef,
  submittedQuery,
  trimmedQuery,
  isRestaurantOverlayVisible,
  restaurantProfile,
  restaurantProfileCacheRef,
  restaurantOverlayDismissHandledRef,
  setRestaurantProfile,
  setRestaurantOverlayVisible,
  profileRuntimeController,
  lastAutoOpenKeyRef,
}: UseProfileAutoOpenControllerArgs): void => {
  const results = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.results,
    Object.is,
    ['results'] as const
  );
  React.useEffect(() => {
    if (!results) {
      return;
    }
    if (isSuggestionPanelActive || isSearchFocused) {
      return;
    }
    const pendingSelection = pendingRestaurantSelectionRef.current;
    if (pendingSelection) {
      const targetRestaurant = results.restaurants?.find(
        (restaurant) => restaurant.restaurantId === pendingSelection.restaurantId
      );
      if (!targetRestaurant) {
        pendingRestaurantSelectionRef.current = null;
        return;
      }
      pendingRestaurantSelectionRef.current = null;
      const queryKey = (submittedQuery || trimmedQuery).trim();
      const isTargetProfileAlreadyOpen =
        isRestaurantOverlayVisible &&
        restaurantProfile?.restaurant.restaurantId === targetRestaurant.restaurantId;
      if (isTargetProfileAlreadyOpen) {
        const queryLabel = queryKey || targetRestaurant.restaurantName || 'Search';
        const cachedProfile = restaurantProfileCacheRef.current.get(targetRestaurant.restaurantId);
        setRestaurantProfile((prev) => {
          if (!prev || prev.restaurant.restaurantId !== targetRestaurant.restaurantId) {
            return prev;
          }
          const nextDishes = cachedProfile?.dishes ?? prev.dishes;
          const nextRestaurant = cachedProfile
            ? {
                ...cachedProfile.restaurant,
                contextualScore: targetRestaurant.contextualScore,
              }
            : targetRestaurant;
          return {
            ...prev,
            restaurant: nextRestaurant,
            queryLabel,
            dishes: nextDishes,
            isLoading: !cachedProfile && nextDishes.length === 0,
          };
        });
        restaurantOverlayDismissHandledRef.current = false;
        setRestaurantOverlayVisible(true);
        profileRuntimeController.focusRestaurantProfileCamera(targetRestaurant, 'autocomplete');
        profileRuntimeController.hydrateRestaurantProfileById(targetRestaurant.restaurantId);
      } else {
        profileRuntimeController.openRestaurantProfile(
          targetRestaurant,
          results.dishes ?? [],
          null,
          'autocomplete'
        );
      }
      if (queryKey) {
        lastAutoOpenKeyRef.current = `${queryKey.toLowerCase()}::${targetRestaurant.restaurantId}`;
      }
      return;
    }
    const targetRestaurant = resolveSingleRestaurantCandidate(results);
    if (!targetRestaurant) {
      return;
    }
    const queryKey = (submittedQuery || trimmedQuery).trim();
    if (!queryKey) {
      return;
    }
    const autoOpenKey = `${queryKey.toLowerCase()}::${targetRestaurant.restaurantId}`;
    if (lastAutoOpenKeyRef.current === autoOpenKey) {
      return;
    }
    profileRuntimeController.openRestaurantProfile(
      targetRestaurant,
      results.dishes ?? [],
      null,
      'auto_open_single_candidate'
    );
    lastAutoOpenKeyRef.current = autoOpenKey;
  }, [
    isSearchFocused,
    isRestaurantOverlayVisible,
    isSuggestionPanelActive,
    profileRuntimeController,
    restaurantProfile,
    results,
    restaurantOverlayDismissHandledRef,
    setRestaurantProfile,
    setRestaurantOverlayVisible,
    submittedQuery,
    trimmedQuery,
    pendingRestaurantSelectionRef,
    restaurantProfileCacheRef,
    lastAutoOpenKeyRef,
  ]);
};
