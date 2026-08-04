import api from './api';

/** Onboarding teaser payload (business/signal/teaser-spec.md). Public
 *  endpoint — works pre-auth; the api client simply omits the bearer token. */
/** The teaser shows exactly one kind of number: the Crave score a restaurant
 *  card shows. Counts and numeric claims were deleted from the payload
 *  (owner ruling 2026-08-02, F109/D7) — there is nothing else to render. */
export interface TeaserRow {
  dishName: string;
  restaurantName: string;
  score: number;
}

export interface TeaserRestaurantRow {
  restaurantName: string;
  score: number;
}

export interface TeaserRestaurantSet {
  kind: 'context' | 'cuisine';
  frame: string;
  rows: TeaserRestaurantRow[];
}

export interface TeaserPreviewPayload {
  source: 'dish' | 'browse';
  dishLabel: string | null;
  city: string;
  top: TeaserRow;
  runners: TeaserRow[];
  restaurants: TeaserRestaurantSet | null;
}

export const fetchTeaserPreview = async (
  city: string,
  dishIds: string[],
  contextIds: string[] = [],
  cuisineIds: string[] = []
): Promise<TeaserPreviewPayload | null> => {
  const response = await api.post<{ payload: TeaserPreviewPayload | null }>('/teaser/preview', {
    city,
    dishIds,
    contextIds,
    cuisineIds,
  });
  return response.data.payload ?? null;
};
