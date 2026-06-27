import { resolveSingleRestaurantCandidate } from '../../utils/response';
import type { RestaurantResult } from '../../../../types';
import type { ProfileAutoOpenActionModel } from './profile-action-model-contract';

export const createProfileAutoOpenActionModel = ({
  results,
  isProfileAutoOpenSuppressed,
  pendingSelection,
  currentQueryKey,
  activeOpenRestaurantId,
  lastAutoOpenKey,
}: ProfileAutoOpenActionModel): ProfileAutoOpenActionModel => ({
  results,
  isProfileAutoOpenSuppressed,
  pendingSelection,
  currentQueryKey,
  activeOpenRestaurantId,
  lastAutoOpenKey,
});

export const resolveProfileAutoOpenAction = ({
  actionModel: {
    results,
    isProfileAutoOpenSuppressed,
    pendingSelection,
    currentQueryKey,
    activeOpenRestaurantId,
    lastAutoOpenKey,
  },
}: {
  actionModel: ProfileAutoOpenActionModel;
}):
  | { kind: 'none' }
  | { kind: 'clear_pending_selection' }
  | {
      kind: 'refresh';
      restaurant: RestaurantResult;
      queryLabel: string;
      nextAutoOpenKey: string | null;
    }
  | {
      kind: 'open';
      restaurant: RestaurantResult;
      source: 'autocomplete' | 'auto_open_single_candidate';
      nextAutoOpenKey: string | null;
    } => {
  if (!results || isProfileAutoOpenSuppressed) {
    return { kind: 'none' };
  }

  if (pendingSelection) {
    const targetRestaurant = results.restaurants?.find(
      (restaurant) => restaurant.restaurantId === pendingSelection.restaurantId
    );
    if (!targetRestaurant) {
      return { kind: 'clear_pending_selection' };
    }
    const nextAutoOpenKey = currentQueryKey
      ? `${currentQueryKey.toLowerCase()}::${targetRestaurant.restaurantId}`
      : null;
    if (activeOpenRestaurantId === targetRestaurant.restaurantId) {
      return {
        kind: 'refresh',
        restaurant: targetRestaurant,
        queryLabel: currentQueryKey || targetRestaurant.restaurantName || 'Search',
        nextAutoOpenKey,
      };
    }
    return {
      kind: 'open',
      restaurant: targetRestaurant,
      source: 'autocomplete',
      nextAutoOpenKey,
    };
  }

  // Favorites-sourced results must always present the list+toggle surface, never
  // auto-open a single restaurant profile. A 1-item restaurant list (or a dish
  // list collapsing to one restaurant) resolves to a single candidate here and
  // would otherwise be hijacked into the restaurant profile. The response itself
  // declares favorites provenance, so the suppression stays source-driven and
  // needs no mode plumbing through the profile runtime.
  const isFavoritesSourcedResults = Boolean(results.metadata?.analysisMetadata?.favorites);

  const targetRestaurant = resolveSingleRestaurantCandidate(results);
  if (!targetRestaurant || !currentQueryKey || isFavoritesSourcedResults) {
    return { kind: 'none' };
  }
  const nextAutoOpenKey = `${currentQueryKey.toLowerCase()}::${targetRestaurant.restaurantId}`;
  if (lastAutoOpenKey === nextAutoOpenKey) {
    return { kind: 'none' };
  }
  return {
    kind: 'open',
    restaurant: targetRestaurant,
    source: 'auto_open_single_candidate',
    nextAutoOpenKey,
  };
};
