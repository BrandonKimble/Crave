import type { GeoBbox, PlacesInViewSliceResponse } from '@crave-search/shared';

import api from './api';

/**
 * Sliding catalog slice read (header subject-store design): the server returns
 * every catalog place intersecting the ×3-expanded margin box around the
 * requested view, plus that marginBox as the client's cache-validity region.
 * Rows are shared PlaceLike VERBATIM — since §2.5 (polygon-native header law)
 * (the DAG stays server-side — descendant expansion reads Prisma, and the
 * header law reads geometry only)
 * and optional `ground` (margin-simplified real-ground rings; absent until a
 * place's polygon lands). Nothing is mapped or dropped here: the store keeps
 * these rows as-is and the shared law judges them.
 * Wrap-aware: a crossing view (minLng > maxLng) passes through as-is — the
 * shared geo law owns the seam on both sides.
 */
export const fetchPlacesInView = async (view: GeoBbox): Promise<PlacesInViewSliceResponse> => {
  const response = await api.get<PlacesInViewSliceResponse>('/places/in-view', {
    params: {
      minLat: view.minLat,
      minLng: view.minLng,
      maxLat: view.maxLat,
      maxLng: view.maxLng,
    },
  });
  return response.data;
};

/** The server's §2/§2.5 viewport→place verdict (ViewportVerdictService — the
 *  SAME composition the polls feed header rides). Nulls = no covering place
 *  ("this area"). Home's header consumes this; polls keeps reading the verdict
 *  off its own feed response. */
export type ViewportVerdictResponse = {
  placeId: string | null;
  placeName: string | null;
};

export const fetchViewportVerdict = async (view: GeoBbox): Promise<ViewportVerdictResponse> => {
  const response = await api.get<ViewportVerdictResponse>('/places/viewport-verdict', {
    params: {
      minLat: view.minLat,
      minLng: view.minLng,
      maxLat: view.maxLat,
      maxLng: view.maxLng,
    },
  });
  return {
    placeId: typeof response.data?.placeId === 'string' ? response.data.placeId : null,
    placeName: typeof response.data?.placeName === 'string' ? response.data.placeName : null,
  };
};
