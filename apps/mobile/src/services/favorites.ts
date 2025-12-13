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
  async add(entityId: string, entityType: FavoriteEntityType): Promise<Favorite> {
    const response = await api.post<Favorite>('/favorites', { entityId, entityType });
    return response.data;
  },
  async remove(favoriteId: string): Promise<void> {
    await api.delete(`/favorites/${favoriteId}`);
  },
  async removeByEntityId(entityId: string): Promise<void> {
    await api.delete(`/favorites/entity/${entityId}`);
  },
};
