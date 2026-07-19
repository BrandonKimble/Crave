import api from './api';

export type FavoriteEntityType = 'restaurant' | 'food' | 'food_attribute' | 'restaurant_attribute';

export interface Favorite {
  favoriteId: string;
  entityId: string;
  entityType: FavoriteEntityType;
  createdAt: string;
  updatedAt: string;
  entity?: {
    entityId: string;
    name: string;
    type: FavoriteEntityType;
    city?: string | null;
  } | null;
}

export const favoritesService = {
  async list(options: { signal?: AbortSignal } = {}): Promise<Favorite[]> {
    const response = await api.get<Favorite[]>('/favorites', { signal: options.signal });
    return response.data;
  },
  // locationId (master plan §7): the in-context saved location for RESTAURANT
  // favorites — the API validates it belongs to the favorited restaurant.
  async add(
    entityId: string,
    entityType: FavoriteEntityType,
    locationId?: string | null
  ): Promise<Favorite> {
    const response = await api.post<Favorite>('/favorites', {
      entityId,
      entityType,
      ...(locationId ? { locationId } : {}),
    });
    return response.data;
  },
  async remove(favoriteId: string): Promise<void> {
    await api.delete(`/favorites/${favoriteId}`);
  },
  async removeByEntityId(entityId: string): Promise<void> {
    await api.delete(`/favorites/entity/${entityId}`);
  },
};
