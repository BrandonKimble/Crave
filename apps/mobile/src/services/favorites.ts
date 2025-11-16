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
  async list(): Promise<Favorite[]> {
    const response = await api.get<Favorite[]>('/favorites');
    return response.data;
  },
  async add(entityId: string): Promise<Favorite> {
    const response = await api.post<Favorite>('/favorites', { entityId });
    return response.data;
  },
  async remove(favoriteId: string): Promise<void> {
    await api.delete(`/favorites/${favoriteId}`);
  },
};
