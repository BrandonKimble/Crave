import React from 'react';
import type { FeatureCollection, Point } from 'geojson';

import type { Coordinate, RestaurantResult } from '../../../../types';
import type { ProfileRuntimeController } from '../profile/profile-runtime-controller';

type ShortcutCoverageFeatureProps = {
  restaurantId?: string;
  restaurantName?: string;
};

type UseMarkerInteractionControllerArgs = {
  anchoredShortcutCoverageFeatures: FeatureCollection<Point, ShortcutCoverageFeatureProps> | null;
  restaurants: RestaurantResult[];
  setMapHighlightedRestaurantId: React.Dispatch<React.SetStateAction<string | null>>;
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
  forceRestaurantProfileMiddleSnapRef: React.MutableRefObject<boolean>;
  profileRuntimeController: ProfileRuntimeController;
};

type UseMarkerInteractionControllerResult = {
  handleMarkerPress: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
};

export const useMarkerInteractionController = ({
  anchoredShortcutCoverageFeatures,
  restaurants,
  setMapHighlightedRestaurantId,
  pendingMarkerOpenAnimationFrameRef,
  forceRestaurantProfileMiddleSnapRef,
  profileRuntimeController,
}: UseMarkerInteractionControllerArgs): UseMarkerInteractionControllerResult => {
  const shortcutCoverageRestaurantNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    const features = anchoredShortcutCoverageFeatures?.features ?? [];
    for (const feature of features) {
      const props = feature.properties;
      const restaurantId = props?.restaurantId;
      const restaurantName = props?.restaurantName;
      if (typeof restaurantId === 'string' && restaurantId && typeof restaurantName === 'string') {
        map.set(restaurantId, restaurantName);
      }
    }
    return map;
  }, [anchoredShortcutCoverageFeatures?.features]);

  const handleMarkerPress = React.useCallback(
    (restaurantId: string, pressedCoordinate?: Coordinate | null) => {
      setMapHighlightedRestaurantId((prev) => (prev === restaurantId ? prev : restaurantId));
      if (pendingMarkerOpenAnimationFrameRef.current != null) {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(pendingMarkerOpenAnimationFrameRef.current);
        }
        pendingMarkerOpenAnimationFrameRef.current = null;
      }
      const restaurant = restaurants.find((item) => item.restaurantId === restaurantId);
      const openProfile = () => {
        if (!restaurant) {
          const fallbackName = shortcutCoverageRestaurantNameById.get(restaurantId);
          if (fallbackName) {
            forceRestaurantProfileMiddleSnapRef.current = true;
            profileRuntimeController.openRestaurantProfilePreview(
              restaurantId,
              fallbackName,
              pressedCoordinate ?? null
            );
          }
          return;
        }
        forceRestaurantProfileMiddleSnapRef.current = true;
        profileRuntimeController.openRestaurantProfile(
          restaurant,
          undefined,
          pressedCoordinate,
          'results_sheet'
        );
      };
      openProfile();
    },
    [
      forceRestaurantProfileMiddleSnapRef,
      pendingMarkerOpenAnimationFrameRef,
      profileRuntimeController,
      restaurants,
      setMapHighlightedRestaurantId,
      shortcutCoverageRestaurantNameById,
    ]
  );

  return { handleMarkerPress };
};
