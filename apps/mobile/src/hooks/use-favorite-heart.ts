import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { userListsService, type UserListEntityMembership } from '../services/user-lists';
import { userListKeys } from './use-user-lists';

/**
 * The HEART VERB (Favorites-as-kind, Spotify Liked-Songs model): a one-tap
 * toggle against the user's kind='favorites' list via the dedicated heart
 * routes — POST /favorites/lists/favorites/items (ensure-then-add; the server
 * lazily creates the list on first heart) and the DELETE twin. It NEVER rides
 * the generic per-list add-item route.
 */

export type HeartTarget = {
  /** Restaurant hearts send restaurantId; dish hearts send connectionId. */
  restaurantId?: string;
  connectionId?: string;
  /** In-context saved location — rides the ADD only. */
  locationId?: string | null;
};

export const isEntityFavorited = (
  memberships: readonly UserListEntityMembership[] | undefined
): boolean => (memberships ?? []).some((membership) => membership.kind === 'favorites');

/** Pure dispatch — RED-provable: heart→addFavoriteItem, unheart→removeFavoriteItem. */
export const runHeartToggle = async ({
  isFavorite,
  target,
}: {
  isFavorite: boolean;
  target: HeartTarget;
}): Promise<'added' | 'removed'> => {
  const selector = target.restaurantId
    ? { restaurantId: target.restaurantId }
    : { connectionId: target.connectionId };
  if (isFavorite) {
    await userListsService.removeFavoriteItem(selector);
    return 'removed';
  }
  await userListsService.addFavoriteItem({
    ...selector,
    locationId: target.locationId ?? undefined,
  });
  return 'added';
};

/**
 * Heart state + toggle for one entity. State reads the SAME entityMemberships
 * query the profile Overview uses (shared cache key), so a modal save into
 * Favorites and the header heart stay coherent.
 */
export const useFavoriteHeart = ({
  entityId,
  locationId,
  entityKind,
  enabled = true,
}: {
  entityId: string | null | undefined;
  locationId?: string | null;
  entityKind: 'restaurant' | 'dish';
  enabled?: boolean;
}) => {
  const queryClient = useQueryClient();
  const membershipsQuery = useQuery({
    queryKey: ['entityMemberships', entityId],
    queryFn: () => userListsService.entityMemberships(entityId as string),
    enabled: enabled && !!entityId,
    staleTime: 1000 * 20,
  });
  const isFavorite = isEntityFavorited(membershipsQuery.data);
  const [isPending, setIsPending] = React.useState(false);

  const toggle = React.useCallback(async () => {
    if (!entityId || isPending) {
      return;
    }
    setIsPending(true);
    try {
      await runHeartToggle({
        isFavorite,
        target:
          entityKind === 'restaurant'
            ? { restaurantId: entityId, locationId }
            : { connectionId: entityId, locationId },
      });
      await queryClient.invalidateQueries({ queryKey: ['entityMemberships', entityId] });
      await queryClient.invalidateQueries({ queryKey: userListKeys.all });
    } finally {
      setIsPending(false);
    }
  }, [entityId, entityKind, isFavorite, isPending, locationId, queryClient]);

  return { isFavorite, isPending, toggle };
};
