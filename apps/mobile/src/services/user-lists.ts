import api from './api';
import type { Coordinate, FoodResult, RestaurantResult, SearchResponse } from '../types';
import type { AuthorIdentity } from './author-identity';

export type UserListType = 'restaurant' | 'dish';
export type UserListVisibility = 'public' | 'private';
/**
 * Favorites-as-kind model: 'favorites' is the one-per-user, undeletable
 * heart-target list (lazily created server-side on first heart); the four
 * signup defaults keep their kinds; everything else is 'standard'.
 */
export type UserListKind =
  | 'standard'
  | 'favorites'
  | 'been'
  | 'want_to_go'
  | 'tried'
  | 'want_to_try';

export interface UserListPreviewItem {
  itemId: string;
  label: string;
  subLabel?: string | null;
  craveScore: number;
}

export interface UserListSummary {
  listId: string;
  name: string;
  description?: string | null;
  listType: UserListType;
  visibility: UserListVisibility;
  /** Favorites-as-kind: rides every summary/detail payload. */
  kind: UserListKind;
  itemCount: number;
  position: number;
  /**
   * Auto-created default lists (page-registry §8.7): 'been' | 'want_to_go' |
   * 'tried' | 'want_to_try'; null for user lists. Wave-2 §2: provenance ONLY —
   * these are REGULAR lists (renamable, movable, deletable, no pinned prefix).
   */
  systemKind: string | null;
  /** Profile-gallery pin (§8.12/§8.14): owner curation; floats first on profiles. */
  pinned?: boolean;
  /** Wave-2 §2 "Use your photos": tile gallery renders the owner's own photos. */
  useOwnPhotos?: boolean;
  /** Majority city of the list's items (§8.15 city grouping) — only on the
   *  public profile read. */
  city?: string | null;
  shareEnabled: boolean;
  shareSlug?: string | null;
  updatedAt: string;
  previewItems: UserListPreviewItem[];
  /**
   * Wave-3 §1.2 (API live since wave-2 §7): the home-tile 2x2 gallery — top photo of
   * each of the list's top-4 restaurants, slots TL(0)→TR(1)→BL(2)→BR(3), sparse at
   * the end (client renders placeholders). Present on the owner home read.
   */
  tileImages?: UserListTileImage[];
}

export interface UserListTileImage {
  slot: 0 | 1 | 2 | 3;
  restaurantId: string;
  photoId: string;
  thumbUrl: string;
}

export type UserListViewerRole = 'owner' | 'collaborator' | 'viewer';
export type UserListSort = 'custom' | 'best' | 'recent';

/** Collaborator roster person (spec B.1.3 — PERSON_SELECT on the API). */
// One shared shape (services/author-identity): these were seven
// near-identical copies, each free to disagree about a deleted person.
export type UserListPerson = AuthorIdentity;

export interface UserListCollaborators {
  owner: UserListPerson;
  collaborators: UserListPerson[];
}

export interface UserListDetail {
  list: UserListSummary;
  /** RT-18/W1: resolved against owner/collaborator/slug-capability grants. */
  viewerRole?: UserListViewerRole;
  /** §8.14: 'custom' iff a custom order exists — the saver's ranking is the default. */
  defaultSort?: UserListSort;
  restaurants?: RestaurantResult[];
  dishes?: FoodResult[];
}

/** One "your list contains this entity" row (§8.4 Overview saved-note block). */
export interface UserListEntityMembership {
  itemId: string;
  listId: string;
  listName: string;
  listType: UserListType;
  /** Favorites-as-kind: 'favorites' rows are the heart-state source of truth. */
  kind: UserListKind;
  systemKind: string | null;
  note: string | null;
}

export const userListsService = {
  async list(params: {
    listType?: UserListType;
    visibility?: UserListVisibility;
  }): Promise<UserListSummary[]> {
    const response = await api.get<UserListSummary[]>('/lists', { params });
    return response.data;
  },
  async listPublic(params: {
    userId: string;
    listType?: UserListType;
  }): Promise<UserListSummary[]> {
    const response = await api.get<UserListSummary[]>(`/users/${params.userId}/lists`, {
      params: { listType: params.listType },
    });
    return response.data;
  },
  async get(listId: string, opts?: { shareSlug?: string | null }): Promise<UserListDetail> {
    // RT-18: a non-owner/non-collaborator read must PRESENT the slug (the capability).
    const response = await api.get<UserListDetail>(`/lists/${listId}`, {
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
      dietary?: string[];
      /** Leg 10 (defect #4): Google price_level values 0–4 — the strip's Price chip. */
      priceLevels?: number[];
      /** The strip's City chip (§8.16, All lists) — a catalog place id. */
      cityPlaceId?: string | null;
      userLocation?: Coordinate;
      pagination?: { page?: number; pageSize?: number };
      /** RT-18 slug-as-capability: shared reads present the slug. */
      shareSlug?: string | null;
      /** Row ordering (W1 §8.14). Omitted = the list's defaultSort. */
      sort?: UserListSort;
      /** Virtual All ids only: whose public lists to union. */
      targetUserId?: string | null;
    }
  ): Promise<SearchResponse> {
    const response = await api.post<SearchResponse>(`/lists/${listId}/results`, {
      openNow: opts?.openNow,
      dietary: opts?.dietary?.length ? opts.dietary : undefined,
      priceLevels: opts?.priceLevels?.length ? opts.priceLevels : undefined,
      cityPlaceId: opts?.cityPlaceId ?? undefined,
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
  /** City-chip vocabulary (§8.16 "sliced by city"): the catalog cities present
   *  in the list (distinct municipality places ground-covering the list's
   *  restaurant locations), most-represented first. */
  async listCities(
    listId: string,
    opts?: { shareSlug?: string | null; targetUserId?: string | null }
  ): Promise<Array<{ placeId: string; name: string; restaurantCount: number }>> {
    const response = await api.post(`/lists/${listId}/cities`, {
      shareSlug: opts?.shareSlug ?? undefined,
      targetUserId: opts?.targetUserId ?? undefined,
    });
    // F836 (2026-08-03): the `'data' in response.data` unwrap branch is DELETED — it was a
    // GUARD THAT CANNOT FIRE. `listCitiesForList` (user-lists.service.ts) is typed
    // `Promise<Array<{placeId; name; restaurantCount}>>` and returns a BARE ARRAY, so
    // `'data' in []` is always false and the branch never ran. The Array.isArray check
    // stays: that one CAN fail (a route change), and it is the real shape assertion.
    return Array.isArray(response.data)
      ? (response.data as Array<{ placeId: string; name: string; restaurantCount: number }>)
      : [];
  },
  async getShared(shareSlug: string): Promise<UserListDetail> {
    const response = await api.get<UserListDetail>(`/lists/share/${shareSlug}`);
    return response.data;
  },
  async create(payload: {
    name: string;
    description?: string;
    listType: UserListType;
    visibility?: UserListVisibility;
  }): Promise<UserListSummary> {
    const response = await api.post<UserListSummary>('/lists', payload);
    return response.data;
  },
  async update(
    listId: string,
    payload: {
      name?: string;
      description?: string;
      visibility?: UserListVisibility;
      /** §8.14 profile pin (owner-only). */
      pinned?: boolean;
      /** Wave-2 §2 "Use your photos" (owner-only). */
      useOwnPhotos?: boolean;
    }
  ): Promise<UserListSummary> {
    const response = await api.patch<UserListSummary>(`/lists/${listId}`, payload);
    return response.data;
  },
  async updatePosition(listId: string, position: number): Promise<void> {
    await api.patch(`/lists/${listId}/position`, { position });
  },
  async remove(listId: string): Promise<void> {
    await api.delete(`/lists/${listId}`);
  },
  // Save-sheet toolkit: `note` rides the add. A `connectionId` sent to a
  // RESTAURANT list is resolved server-side to that connection's restaurant
  // (the §8.8 dish→restaurant side flip). `locationId` (master plan §7) is the
  // in-context saved location — the API validates it belongs to the item's
  // restaurant and ListDetail renders exactly that pin.
  async addItem(
    listId: string,
    payload: {
      restaurantId?: string;
      connectionId?: string;
      locationId?: string;
      note?: string;
    }
  ) {
    const response = await api.post(`/lists/${listId}/items`, payload);
    return response.data;
  },
  /**
   * Heart verb (Spotify Liked-Songs model): ensure-then-add against the user's
   * kind='favorites' list — the server LAZILY creates it on first use. Same
   * body shape as addItem, no listId (the kind IS the address).
   */
  async addFavoriteItem(payload: {
    restaurantId?: string;
    connectionId?: string;
    locationId?: string;
    note?: string;
  }) {
    const response = await api.post('/lists/favorites/items', payload);
    return response.data;
  },
  /** Unheart: remove from the user's kind='favorites' list. */
  async removeFavoriteItem(payload: {
    restaurantId?: string;
    connectionId?: string;
    locationId?: string;
  }) {
    const response = await api.delete('/lists/favorites/items', { data: payload });
    return response.data;
  },
  /**
   * Batch drag-save (W1 edit mode): orderedItemIds must be EXACTLY the list's
   * current membership (the API enforces set equality — loud contract).
   */
  async reorderItems(listId: string, orderedItemIds: string[]): Promise<void> {
    await api.patch(`/lists/${listId}/items/order`, { orderedItemIds });
  },
  async getCollaborators(
    listId: string,
    opts?: { shareSlug?: string | null }
  ): Promise<UserListCollaborators> {
    const response = await api.get<UserListCollaborators>(`/lists/${listId}/collaborators`, {
      params: opts?.shareSlug ? { shareSlug: opts.shareSlug } : undefined,
    });
    return response.data;
  },
  /** Join via invite link (RT-18: the slug presented WITH intent is the invite). */
  async joinCollaborators(
    listId: string,
    shareSlug: string
  ): Promise<{ listId: string; role: 'owner' | 'collaborator' }> {
    const response = await api.post<{ listId: string; role: 'owner' | 'collaborator' }>(
      `/lists/${listId}/collaborators/join`,
      { shareSlug }
    );
    return response.data;
  },
  /** Owner-kick or self-leave (the API fails closed on anything else). */
  async removeCollaborator(listId: string, userId: string): Promise<void> {
    await api.delete(`/lists/${listId}/collaborators/${userId}`);
  },
  async updateItemPosition(listId: string, itemId: string, position: number): Promise<void> {
    await api.patch(`/lists/${listId}/items/${itemId}`, { position });
  },
  /** Item-editor (Edit pill): null clears the note. */
  async updateItemNote(listId: string, itemId: string, note: string | null): Promise<void> {
    await api.patch(`/lists/${listId}/items/${itemId}`, { note });
  },
  async removeItem(listId: string, itemId: string): Promise<void> {
    await api.delete(`/lists/${listId}/items/${itemId}`);
  },
  async enableShare(listId: string, rotate = false): Promise<{ shareSlug: string }> {
    const response = await api.post(`/lists/${listId}/share`, { rotate });
    return response.data;
  },
  async disableShare(listId: string): Promise<void> {
    await api.delete(`/lists/${listId}/share`);
  },
  /**
   * Red-team W2 (page-registry §8.4 Overview element 1): the viewer's lists
   * containing an entity (restaurant or dish connection), incl. saved notes.
   */
  async entityMemberships(entityId: string): Promise<UserListEntityMembership[]> {
    const response = await api.get<UserListEntityMembership[]>(
      `/lists/entities/${entityId}/memberships`
    );
    return response.data;
  },
  /**
   * ONE batched saved-anywhere read for a screenful of cards (plus/saved pill
   * state) — the server returns the distinct subset of the asked ids that
   * live in any list the viewer owns or co-edits.
   */
  async batchMemberships(query: {
    restaurantIds?: string[];
    connectionIds?: string[];
  }): Promise<{ savedRestaurantIds: string[]; savedConnectionIds: string[] }> {
    const response = await api.post<{
      savedRestaurantIds: string[];
      savedConnectionIds: string[];
    }>('/lists/memberships', query);
    return response.data;
  },
};
