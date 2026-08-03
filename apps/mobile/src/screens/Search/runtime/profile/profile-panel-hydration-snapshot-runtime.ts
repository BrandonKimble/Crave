import type {
  HydratedRestaurantProfile,
  RestaurantPanelSnapshot,
  RestaurantProfileSeed,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

type RestaurantProfileLocation = NonNullable<
  NonNullable<RestaurantProfileSeed['locations']>[number]
>;

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

/** PRESENCE, not magnitude (F758): post-F758 `craveScore` is `number | null` and NULL is
 *  the ONE spelling of "unscored". A real 0 is a legitimate score — the worst-ranked
 *  scored restaurant — and must survive every hand-off. The two hand-offs in this file
 *  used to disagree (`> 0` here, `Number.isFinite` in the seed builder), so a genuine 0
 *  was preserved on the seed and then thrown away on hydrate. ONE predicate, both sites:
 *  present = a finite number (NaN is corruption, not a score, and is treated as absent). */
const hasPresentCraveScore = (craveScore: number | null | undefined): craveScore is number =>
  typeof craveScore === 'number' && Number.isFinite(craveScore);

const resolveHydratedCraveScore = ({
  currentSnapshot,
  hydratedProfile,
}: {
  currentSnapshot: RestaurantPanelSnapshot;
  hydratedProfile: HydratedRestaurantProfile;
}): number | null =>
  hasPresentCraveScore(currentSnapshot.restaurant.craveScore)
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
  const existingDishes = isSameRestaurant ? (currentSnapshot?.dishes ?? []) : [];
  const nextDishes = cachedProfile?.dishes ?? existingDishes;
  const preferredLocationId =
    selectedLocationId ?? currentSnapshot?.restaurant.displayLocation?.locationId ?? null;
  const seededRestaurant = cachedProfile
    ? withPreferredDisplayLocation({
        restaurant: {
          ...cachedProfile.restaurant,
          craveScore: hasPresentCraveScore(restaurant.craveScore)
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
    isFavorite: isSameRestaurant ? (currentSnapshot?.isFavorite ?? false) : false,
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
