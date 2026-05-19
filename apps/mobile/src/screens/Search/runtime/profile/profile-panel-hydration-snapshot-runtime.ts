import type {
  HydratedRestaurantProfile,
  RestaurantPanelSnapshot,
  RestaurantProfileSeed,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

type RestaurantProfileLocation = NonNullable<NonNullable<RestaurantProfileSeed['locations']>[number]>;

const resolveRestaurantDisplayLocation = ({
  restaurant,
  preferredLocationId,
}: {
  restaurant: RestaurantProfileSeed;
  preferredLocationId?: string | null;
}): RestaurantProfileLocation | null => {
  const locations = Array.isArray(restaurant.locations) ? restaurant.locations : [];
  if (preferredLocationId) {
    const matched =
      locations.find((location) => location.locationId === preferredLocationId) ?? null;
    if (matched) {
      return matched;
    }
  }
  return restaurant.displayLocation ?? locations[0] ?? null;
};

const withPreferredDisplayLocation = ({
  restaurant,
  preferredLocationId,
}: {
  restaurant: RestaurantProfileSeed;
  preferredLocationId?: string | null;
}): RestaurantProfileSeed => ({
  ...restaurant,
  displayLocation: resolveRestaurantDisplayLocation({
    restaurant,
    preferredLocationId,
  }),
});

const resolveHydratedCraveScore = ({
  currentSnapshot,
  hydratedProfile,
}: {
  currentSnapshot: RestaurantPanelSnapshot;
  hydratedProfile: HydratedRestaurantProfile;
}): number =>
  typeof currentSnapshot.restaurant.craveScore === 'number' && currentSnapshot.restaurant.craveScore > 0
    ? currentSnapshot.restaurant.craveScore
    : hydratedProfile.restaurant.craveScore;

export const createSeededRestaurantPanelSnapshot = ({
  currentSnapshot,
  restaurant,
  queryLabel,
  cachedProfile,
  selectedLocationId,
}: {
  currentSnapshot: RestaurantPanelSnapshot | null;
  restaurant: RestaurantProfileSeed;
  queryLabel: string;
  cachedProfile: HydratedRestaurantProfile | undefined;
  selectedLocationId?: string | null;
}): RestaurantPanelSnapshot => {
  const restaurantId = restaurant.restaurantId;
  const isSameRestaurant = currentSnapshot?.restaurant.restaurantId === restaurantId;
  const existingDishes = isSameRestaurant ? currentSnapshot?.dishes ?? [] : [];
  const nextDishes = cachedProfile?.dishes ?? existingDishes;
  const preferredLocationId =
    selectedLocationId ?? currentSnapshot?.restaurant.displayLocation?.locationId ?? null;
  const seededRestaurant = cachedProfile
    ? withPreferredDisplayLocation({
        restaurant: {
          ...cachedProfile.restaurant,
          craveScore:
            typeof restaurant.craveScore === 'number' && Number.isFinite(restaurant.craveScore)
              ? restaurant.craveScore
              : cachedProfile.restaurant.craveScore,
        },
        preferredLocationId,
      })
    : withPreferredDisplayLocation({
        restaurant,
        preferredLocationId,
      });
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

  const preferredLocationId = currentSnapshot.restaurant.displayLocation?.locationId ?? null;

  return {
    ...currentSnapshot,
    restaurant: withPreferredDisplayLocation({
      restaurant: {
        ...hydratedProfile.restaurant,
        craveScore: resolveHydratedCraveScore({
          currentSnapshot,
          hydratedProfile,
        }),
      },
      preferredLocationId,
    }),
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
