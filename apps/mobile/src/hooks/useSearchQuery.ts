import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Coordinate, MapBounds, NaturalSearchRequest, SearchResponse } from '../types';
import { searchService } from '../services/search';
import { useDebouncedValue } from './useDebouncedValue';

export const DEFAULT_SEARCH_PAGE_SIZE = 20;

export interface SearchQueryParams {
  query: string;
  page?: number;
  pageSize?: number;
  openNow?: boolean;
  bounds?: MapBounds | null;
  userLocation?: Coordinate;
  includeSqlPreview?: boolean;
  priceLevels?: number[];
}

export interface SearchQueryCacheKey {
  query: string;
  page: number;
  pageSize: number;
  openNow: boolean;
  bounds: MapBounds | null;
  priceLevels: number[] | null;
}

export const searchKeys = {
  all: ['search'] as const,
  query: (params: SearchQueryCacheKey) => ['search', params] as const,
};

const buildRequestPayload = (
  params: SearchQueryCacheKey & {
    includeSqlPreview?: boolean;
    userLocation?: Coordinate;
  }
): NaturalSearchRequest => {
  const payload: NaturalSearchRequest = {
    query: params.query,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
    },
  };

  if (params.bounds) {
    payload.bounds = params.bounds;
  }

  if (params.openNow) {
    payload.openNow = params.openNow;
  }

  if (params.priceLevels && params.priceLevels.length > 0) {
    payload.priceLevels = params.priceLevels;
  }

  if (params.userLocation) {
    payload.userLocation = params.userLocation;
  }

  if (params.includeSqlPreview !== undefined) {
    payload.includeSqlPreview = params.includeSqlPreview;
  }

  return payload;
};

const normalizeParams = (params: SearchQueryParams, query: string): SearchQueryCacheKey => {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? DEFAULT_SEARCH_PAGE_SIZE;
  const bounds = params.bounds ?? null;
  const priceLevels = normalizePriceLevels(params.priceLevels);

  return {
    query,
    page,
    pageSize,
    openNow: params.openNow ?? false,
    bounds,
    priceLevels,
  };
};

const normalizePriceLevels = (levels?: number[] | null): number[] | null => {
  if (!Array.isArray(levels) || levels.length === 0) {
    return null;
  }

  const normalized = Array.from(
    new Set(
      levels
        .map((level) => Math.round(level))
        .filter((level) => Number.isInteger(level) && level >= 0 && level <= 4)
    )
  ).sort((a, b) => a - b);

  return normalized.length ? normalized : null;
};

export interface UseSearchQueryOptions {
  enabled?: boolean;
  debounceMs?: number;
}

export function useSearchQuery(
  params: SearchQueryParams,
  options: UseSearchQueryOptions = {}
): UseQueryResult<SearchResponse> {
  const { enabled = true, debounceMs = 300 } = options;
  const trimmedQuery = params.query.trim();
  const debouncedQuery = useDebouncedValue(trimmedQuery, debounceMs);

  const cacheParams = React.useMemo(() => {
    if (!debouncedQuery) {
      return null;
    }
    return normalizeParams(params, debouncedQuery);
  }, [params, debouncedQuery]);

  const shouldFetch = enabled && !!cacheParams && cacheParams.query.length > 0;

  const result = useQuery({
    queryKey: cacheParams ? searchKeys.query(cacheParams) : searchKeys.all,
    queryFn: () =>
      cacheParams
        ? searchService.naturalSearch(
            buildRequestPayload({
              ...cacheParams,
              includeSqlPreview: params.includeSqlPreview,
              userLocation: params.userLocation,
            })
          )
        : Promise.resolve(null as unknown as SearchResponse),
    enabled: shouldFetch,
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 10, // 10 minutes
  });

  return result;
}

export function usePrefetchSearchQuery() {
  const queryClient = useQueryClient();

  return React.useCallback(
    async (params: SearchQueryParams) => {
      const trimmed = params.query.trim();
      if (!trimmed) {
        return;
      }

      const cacheParams = normalizeParams(params, trimmed);

      await queryClient.prefetchQuery({
        queryKey: searchKeys.query(cacheParams),
        queryFn: () =>
          searchService.naturalSearch(
            buildRequestPayload({
              ...cacheParams,
              includeSqlPreview: params.includeSqlPreview,
              userLocation: params.userLocation,
            })
          ),
      });
    },
    [queryClient]
  );
}
