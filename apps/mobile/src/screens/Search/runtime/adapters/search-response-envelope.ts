import type { SearchResponse } from '../../../../types';

export type SearchResponseEnvelope = {
  format: SearchResponse['format'] | null;
  page: number;
  searchRequestId: string | null;
  dishCount: number;
  restaurantCount: number;
};

export const createSearchResponseEnvelope = (
  response: SearchResponse,
  fallbackPage: number
): SearchResponseEnvelope => ({
  format: response.format ?? null,
  page:
    typeof response.metadata?.page === 'number' && Number.isFinite(response.metadata.page)
      ? response.metadata.page
      : fallbackPage,
  searchRequestId:
    typeof response.metadata?.searchRequestId === 'string' &&
    response.metadata.searchRequestId.length > 0
      ? response.metadata.searchRequestId
      : null,
  dishCount: response.dishes?.length ?? 0,
  restaurantCount: response.restaurants?.length ?? 0,
});
