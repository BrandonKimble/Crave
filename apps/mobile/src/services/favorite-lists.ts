import api from './api';
import type { Coordinate, FoodResult, RestaurantResult, SearchResponse } from '../types';

export type FavoriteListType = 'restaurant' | 'dish';
export type FavoriteListVisibility = 'public' | 'private';

export interface FavoriteListPreviewItem {
  itemId: string;
  label: string;
  subLabel?: string | null;
  craveScore: number;
}

export interface FavoriteListSummary {
  listId: string;
  name: string;
  description?: string | null;
  listType: FavoriteListType;
  visibility: FavoriteListVisibility;
  itemCount: number;
  position: number;
  shareEnabled: boolean;
  shareSlug?: string | null;
  updatedAt: string;
  previewItems: FavoriteListPreviewItem[];
}

export interface FavoriteListDetail {
  list: FavoriteListSummary;
  restaurants?: RestaurantResult[];
  dishes?: FoodResult[];
}

export const favoriteListsService = {
  async list(params: {
    listType?: FavoriteListType;
    visibility?: FavoriteListVisibility;
  }): Promise<FavoriteListSummary[]> {
    const response = await api.get<FavoriteListSummary[]>('/favorites/lists', { params });
    return response.data;
  },
  async listPublic(params: {
    userId: string;
    listType?: FavoriteListType;
  }): Promise<FavoriteListSummary[]> {
    const response = await api.get<FavoriteListSummary[]>(
      `/users/${params.userId}/favorites/lists`,
      {
        params: { listType: params.listType },
      }
    );
    return response.data;
  },
  async get(listId: string): Promise<FavoriteListDetail> {
    const response = await api.get<FavoriteListDetail>(`/favorites/lists/${listId}`);
    return response.data;
  },
  // Hydrate a favorites list into a FULL SearchResponse (same shape a real
  // /search returns) so the mobile results surface can render it through the
  // EXISTING search response lifecycle. The favorites launch is "a natural
  // search whose data SOURCE is the favorites endpoint instead of /search".
  // No bounds field by design (v1 fits the map to the list extent).
  async getListResults(
    listId: string,
    opts?: {
      openNow?: boolean;
      userLocation?: Coordinate;
      pagination?: { page?: number; pageSize?: number };
    }
  ): Promise<SearchResponse> {
    const response = await api.post<SearchResponse>(`/favorites/lists/${listId}/results`, {
      openNow: opts?.openNow,
      userLocation: opts?.userLocation
        ? { lat: opts.userLocation.lat, lng: opts.userLocation.lng }
        : undefined,
      pagination: opts?.pagination,
    });
    return response.data;
  },
  async getShared(shareSlug: string): Promise<FavoriteListDetail> {
    const response = await api.get<FavoriteListDetail>(`/favorites/lists/share/${shareSlug}`);
    return response.data;
  },
  async create(payload: {
    name: string;
    description?: string;
    listType: FavoriteListType;
    visibility?: FavoriteListVisibility;
  }): Promise<FavoriteListSummary> {
    const response = await api.post<FavoriteListSummary>('/favorites/lists', payload);
    return response.data;
  },
  async update(
    listId: string,
    payload: { name?: string; description?: string; visibility?: FavoriteListVisibility }
  ): Promise<FavoriteListSummary> {
    const response = await api.patch<FavoriteListSummary>(`/favorites/lists/${listId}`, payload);
    return response.data;
  },
  async updatePosition(listId: string, position: number): Promise<void> {
    await api.patch(`/favorites/lists/${listId}/position`, { position });
  },
  async remove(listId: string): Promise<void> {
    await api.delete(`/favorites/lists/${listId}`);
  },
  async addItem(listId: string, payload: { restaurantId?: string; connectionId?: string }) {
    const response = await api.post(`/favorites/lists/${listId}/items`, payload);
    return response.data;
  },
  async updateItemPosition(listId: string, itemId: string, position: number): Promise<void> {
    await api.patch(`/favorites/lists/${listId}/items/${itemId}`, { position });
  },
  async removeItem(listId: string, itemId: string): Promise<void> {
    await api.delete(`/favorites/lists/${listId}/items/${itemId}`);
  },
  async enableShare(listId: string, rotate = false): Promise<{ shareSlug: string }> {
    const response = await api.post(`/favorites/lists/${listId}/share`, { rotate });
    return response.data;
  },
  async disableShare(listId: string): Promise<void> {
    await api.delete(`/favorites/lists/${listId}/share`);
  },
};
