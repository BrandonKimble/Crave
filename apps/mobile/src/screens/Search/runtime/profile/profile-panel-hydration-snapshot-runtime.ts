import type { RestaurantResult } from '../../../../types';
import type {
  HydratedRestaurantProfile,
  RestaurantPanelSnapshot,
} from './profile-transition-state-contract';

const resolveHydratedContextualScore = ({
  currentSnapshot,
  hydratedProfile,
}: {
  currentSnapshot: RestaurantPanelSnapshot;
  hydratedProfile: HydratedRestaurantProfile;
}): number =>
  typeof currentSnapshot.restaurant.contextualScore === 'number' &&
  currentSnapshot.restaurant.contextualScore > 0
    ? currentSnapshot.restaurant.contextualScore
    : hydratedProfile.restaurant.contextualScore;

export const createSeededRestaurantPanelSnapshot = ({
  currentSnapshot,
  restaurant,
  queryLabel,
  cachedProfile,
}: {
  currentSnapshot: RestaurantPanelSnapshot | null;
  restaurant: RestaurantResult;
  queryLabel: string;
  cachedProfile: HydratedRestaurantProfile | undefined;
}): RestaurantPanelSnapshot => {
  const restaurantId = restaurant.restaurantId;
  const isSameRestaurant = currentSnapshot?.restaurant.restaurantId === restaurantId;
  const existingDishes = isSameRestaurant ? currentSnapshot?.dishes ?? [] : [];
  const nextDishes = cachedProfile?.dishes ?? existingDishes;
  const seededRestaurant = cachedProfile
    ? {
        ...cachedProfile.restaurant,
        contextualScore: restaurant.contextualScore,
      }
    : restaurant;
  const shouldShowLoading = !cachedProfile && nextDishes.length === 0;

  return {
    restaurant: seededRestaurant,
    dishes: nextDishes,
    queryLabel,
    isFavorite: isSameRestaurant ? currentSnapshot?.isFavorite ?? false : false,
    isLoading: shouldShowLoading,
  };
};

export const applyHydratedRestaurantProfileToPanelSnapshot = ({
  currentSnapshot,
  restaurantId,
  hydratedProfile,
}: {
  currentSnapshot: RestaurantPanelSnapshot | null;
  restaurantId: string;
  hydratedProfile: HydratedRestaurantProfile;
}): RestaurantPanelSnapshot | null => {
  if (!currentSnapshot || currentSnapshot.restaurant.restaurantId !== restaurantId) {
    return currentSnapshot;
  }

  return {
    ...currentSnapshot,
    restaurant: {
      ...hydratedProfile.restaurant,
      contextualScore: resolveHydratedContextualScore({
        currentSnapshot,
        hydratedProfile,
      }),
    },
    dishes: hydratedProfile.dishes,
    isLoading: false,
  };
};

export const markRestaurantPanelSnapshotHydrating = ({
  currentSnapshot,
  restaurantId,
}: {
  currentSnapshot: RestaurantPanelSnapshot | null;
  restaurantId: string;
}): RestaurantPanelSnapshot | null => {
  if (!currentSnapshot || currentSnapshot.restaurant.restaurantId !== restaurantId) {
    return currentSnapshot;
  }
  if (currentSnapshot.dishes.length > 0 || currentSnapshot.isLoading) {
    return currentSnapshot;
  }

  return {
    ...currentSnapshot,
    isLoading: true,
  };
};

export const clearRestaurantPanelSnapshotHydrating = ({
  currentSnapshot,
  restaurantId,
}: {
  currentSnapshot: RestaurantPanelSnapshot | null;
  restaurantId: string;
}): RestaurantPanelSnapshot | null => {
  if (!currentSnapshot || currentSnapshot.restaurant.restaurantId !== restaurantId) {
    return currentSnapshot;
  }

  return {
    ...currentSnapshot,
    isLoading: false,
  };
};
