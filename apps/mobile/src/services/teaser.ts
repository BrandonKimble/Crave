import api from './api';

/** Onboarding teaser payload (business/signal/teaser-spec.md). Public
 *  endpoint — works pre-auth; the api client simply omits the bearer token. */
export interface TeaserRow {
  dishName: string;
  restaurantName: string;
  score: number;
  mentionCount: number;
  totalUpvotes: number;
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
  totalCount: number;
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
