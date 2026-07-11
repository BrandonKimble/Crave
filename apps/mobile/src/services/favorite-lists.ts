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
  /**
   * Auto-created default lists (page-registry §8.7): 'been' | 'want_to_go' |
   * 'tried' | 'want_to_try'; null for user lists. System lists arrive pinned
   * first in the server ordering and are not deletable.
   */
  systemKind: string | null;
  /** Profile-gallery pin (§8.12/§8.14): owner curation; floats first on profiles. */
  pinned?: boolean;
  /** Majority market of the list's items (§8.15 city grouping) — only on the
   *  public profile read. */
  city?: string | null;
  shareEnabled: boolean;
  shareSlug?: string | null;
  updatedAt: string;
  previewItems: FavoriteListPreviewItem[];
}

export type FavoriteListViewerRole = 'owner' | 'collaborator' | 'viewer';
export type FavoriteListSort = 'custom' | 'best' | 'recent';

/** Collaborator roster person (spec B.1.3 — PERSON_SELECT on the API). */
export interface FavoriteListPerson {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface FavoriteListCollaborators {
  owner: FavoriteListPerson;
  collaborators: FavoriteListPerson[];
}

export interface FavoriteListDetail {
  list: FavoriteListSummary;
  /** RT-18/W1: resolved against owner/collaborator/slug-capability grants. */
  viewerRole?: FavoriteListViewerRole;
  /** §8.14: 'custom' iff a custom order exists — the saver's ranking is the default. */
  defaultSort?: FavoriteListSort;
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
  async get(listId: string, opts?: { shareSlug?: string | null }): Promise<FavoriteListDetail> {
    // RT-18: a non-owner/non-collaborator read must PRESENT the slug (the capability).
    const response = await api.get<FavoriteListDetail>(`/favorites/lists/${listId}`, {
      params: opts?.shareSlug ? { shareSlug: opts.shareSlug } : undefined,
    });
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
      /** RT-18 slug-as-capability: shared reads present the slug. */
      shareSlug?: string | null;
      /** Row ordering (W1 §8.14). Omitted = the list's defaultSort. */
      sort?: FavoriteListSort;
      /** Virtual All ids only: whose public lists to union. */
      targetUserId?: string | null;
    }
  ): Promise<SearchResponse> {
    const response = await api.post<SearchResponse>(`/favorites/lists/${listId}/results`, {
      openNow: opts?.openNow,
      userLocation: opts?.userLocation
        ? { lat: opts.userLocation.lat, lng: opts.userLocation.lng }
        : undefined,
      pagination: opts?.pagination,
      shareSlug: opts?.shareSlug ?? undefined,
      sort: opts?.sort,
      targetUserId: opts?.targetUserId ?? undefined,
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
    payload: {
      name?: string;
      description?: string;
      visibility?: FavoriteListVisibility;
      /** §8.14 profile pin (owner-only). */
      pinned?: boolean;
    }
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
  // Save-sheet toolkit: `note` rides the add. A `connectionId` sent to a
  // RESTAURANT list is resolved server-side to that connection's restaurant
  // (the §8.8 dish→restaurant side flip).
  async addItem(
    listId: string,
    payload: { restaurantId?: string; connectionId?: string; note?: string }
  ) {
    const response = await api.post(`/favorites/lists/${listId}/items`, payload);
    return response.data;
  },
  /**
   * Batch drag-save (W1 edit mode): orderedItemIds must be EXACTLY the list's
   * current membership (the API enforces set equality — loud contract).
   */
  async reorderItems(listId: string, orderedItemIds: string[]): Promise<void> {
    await api.patch(`/favorites/lists/${listId}/items/order`, { orderedItemIds });
  },
  async getCollaborators(
    listId: string,
    opts?: { shareSlug?: string | null }
  ): Promise<FavoriteListCollaborators> {
    const response = await api.get<FavoriteListCollaborators>(
      `/favorites/lists/${listId}/collaborators`,
      { params: opts?.shareSlug ? { shareSlug: opts.shareSlug } : undefined }
    );
    return response.data;
  },
  /** Join via invite link (RT-18: the slug presented WITH intent is the invite). */
  async joinCollaborators(
    listId: string,
    shareSlug: string
  ): Promise<{ listId: string; role: 'owner' | 'collaborator' }> {
    const response = await api.post<{ listId: string; role: 'owner' | 'collaborator' }>(
      `/favorites/lists/${listId}/collaborators/join`,
      { shareSlug }
    );
    return response.data;
  },
  /** Owner-kick or self-leave (the API fails closed on anything else). */
  async removeCollaborator(listId: string, userId: string): Promise<void> {
    await api.delete(`/favorites/lists/${listId}/collaborators/${userId}`);
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
