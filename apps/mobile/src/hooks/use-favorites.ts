import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { favoritesService, type Favorite, type FavoriteEntityType } from '../services/favorites';
import { logger } from '../utils';

export const favoritesKeys = {
  all: ['favorites'] as const,
  list: () => ['favorites', 'list'] as const,
};

type ToggleFavoriteInput = {
  entityId: string;
  entityType: FavoriteEntityType;
  nextIsFavorite: boolean;
};

type ToggleFavoriteContext = {
  previousFavorites: Favorite[] | undefined;
};

const buildOptimisticFavorite = (entityId: string, entityType: FavoriteEntityType): Favorite => ({
  favoriteId: `temp-${entityId}`,
  entityId,
  entityType,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  entity: null,
});

export function useFavorites(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const queryClient = useQueryClient();
  const inFlightRef = React.useRef<Set<string>>(new Set());

  const favoritesQuery = useQuery({
    queryKey: favoritesKeys.list(),
    queryFn: ({ signal }) => favoritesService.list({ signal }),
    enabled,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 10,
  });

  const favorites = favoritesQuery.data ?? [];

  const favoriteMap = React.useMemo(
    () => new Map(favorites.map((favorite) => [favorite.entityId, favorite])),
    [favorites]
  );

  const toggleMutation = useMutation<
    Favorite | void,
    unknown,
    ToggleFavoriteInput,
    ToggleFavoriteContext
  >({
    mutationFn: async ({ entityId, entityType, nextIsFavorite }) => {
      if (nextIsFavorite) {
        return favoritesService.add(entityId, entityType);
      }
      await favoritesService.removeByEntityId(entityId);
    },
    onMutate: ({ entityId, entityType, nextIsFavorite }) => {
      const previousFavorites = queryClient.getQueryData<Favorite[]>(favoritesKeys.list());

      queryClient.setQueryData<Favorite[]>(favoritesKeys.list(), (current) => {
        const existing = current ?? [];
        const without = existing.filter((favorite) => favorite.entityId !== entityId);

        if (!nextIsFavorite) {
          return without;
        }

        return [buildOptimisticFavorite(entityId, entityType), ...without];
      });

      void queryClient.cancelQueries({ queryKey: favoritesKeys.list() });
      return { previousFavorites };
    },
    onSuccess: (result, variables) => {
      if (!variables.nextIsFavorite || !result) {
        return;
      }

      queryClient.setQueryData<Favorite[]>(favoritesKeys.list(), (current) => {
        const existing = current ?? [];
        const without = existing.filter((favorite) => favorite.entityId !== variables.entityId);
        return [result, ...without];
      });
    },
    onError: (error, _variables, context) => {
      logger.error('Failed to toggle favorite', error);
      queryClient.setQueryData<Favorite[]>(favoritesKeys.list(), context?.previousFavorites ?? []);
    },
  });

  const toggleFavorite = React.useCallback(
    async (entityId: string, entityType: FavoriteEntityType) => {
      if (!entityId) {
        return;
      }

      if (inFlightRef.current.has(entityId)) {
        return;
      }

      inFlightRef.current.add(entityId);

      try {
        const currentFavorites = queryClient.getQueryData<Favorite[]>(favoritesKeys.list()) ?? [];
        const isFavorite = currentFavorites.some((favorite) => favorite.entityId === entityId);

        try {
          await toggleMutation.mutateAsync({
            entityId,
            entityType,
            nextIsFavorite: !isFavorite,
          });
        } catch {
          // Errors are handled via `onError` to revert optimistic state.
        }
      } finally {
        inFlightRef.current.delete(entityId);
      }
    },
    [queryClient, toggleMutation]
  );

  return {
    favoritesQuery,
    favorites,
    favoriteMap,
    favoritesVersion: favoritesQuery.dataUpdatedAt,
    toggleFavorite,
  };
}
