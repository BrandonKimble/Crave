import type { GeoBbox, PlacesInViewSliceResponse } from '@crave-search/shared';

import api from './api';

/**
 * Sliding catalog slice read (header subject-store design): the server returns
 * every catalog place intersecting the ×3-expanded margin box around the
 * requested view, plus that marginBox as the client's cache-validity region.
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
