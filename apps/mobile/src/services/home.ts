import api from './api';
import type { MapBounds } from '../types';
import type { HomeFeedCity, HomeFeedResponse } from './home-types';
import { normalizeHomeFeedResponse } from './home-feed-normalize';

/**
 * HOME feed reads (home-surface-charter): GET /home/feed resolves the
 * viewport to the containing live city server-side (the SAME shared
 * ViewportVerdictService composition the polls feed rides — no separate
 * verdict fetch client-side) and returns the curated shelves.
 */
export type { HomeFeedCity, HomeFeedResponse, HomeShelf, HomeShelfList } from './home-types';
export { normalizeHomeFeedResponse } from './home-feed-normalize';

/** Curated list detail (GET /home/lists/:id) — mirrors the favorites detail
 *  vocabulary with viewerRole always 'viewer'. */
export type CuratedListDetailItem = {
  rank: number;
  entityId: string;
  restaurantId: string | null;
  /** Dish items: the Connection id, a BUILD FACT stored on the curated row
   *  (FK-cascaded — can never dangle). Null only on legacy rows predating the
   *  column; restaurant items always null. */
  connectionId: string | null;
  label: string;
  subLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  craveScore: number | null;
  craveScoreExact: number | null;
  rising: number | null;
};

export type CuratedListDetailResponse = {
  listId: string;
  title: string;
  subtitle: string | null;
  iconKey: string;
  listType: string;
  recipeKey: string;
  rotationKey: string;
  scope: string;
  city: HomeFeedCity;
  itemCount: number;
  builtAt: string;
  viewerRole: 'viewer';
  items: CuratedListDetailItem[];
};

export const fetchHomeFeed = async (
  bounds: MapBounds,
  options?: { pickedCityId?: string | null }
): Promise<HomeFeedResponse> => {
  const response = await api.get('/home/feed', {
    params: {
      minLat: bounds.southWest.lat,
      minLng: bounds.southWest.lng,
      maxLat: bounds.northEast.lat,
      maxLng: bounds.northEast.lng,
      // Soft fallback only — the server's viewport verdict wins when it
      // honestly resolves a live city (see home-feed-store.pickedCityId).
      ...(options?.pickedCityId ? { pickedCityId: options.pickedCityId } : {}),
    },
  });
  return normalizeHomeFeedResponse(response.data);
};

/** Save-a-copy (list-detail verbs, curated canSaveCopy): POST /home/lists/:id/save
 *  copies the curated list's CURRENT items into a new favorites list the caller owns. */
export const saveCuratedListToMyLists = async (
  listId: string
): Promise<{ listId: string; name: string }> => {
  const response = await api.post<{ listId: string; name: string }>(`/home/lists/${listId}/save`);
  return response.data;
};

export const fetchCuratedListDetail = async (
  listId: string
): Promise<CuratedListDetailResponse> => {
  const response = await api.get<CuratedListDetailResponse>(`/home/lists/${listId}`);
  return response.data;
};
