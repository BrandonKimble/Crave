import type {
  Coordinate,
  MapBounds,
  NaturalSearchRequest,
  Pagination,
  SearchResponse,
} from '../types';
import api from './api';

export interface StructuredSearchRequest {
  entities: {
    restaurants?: unknown[];
    food?: unknown[];
    foodAttributes?: unknown[];
    restaurantAttributes?: unknown[];
  };
  bounds?: MapBounds;
  openNow?: boolean;
  pagination?: Pagination;
  includeSqlPreview?: boolean;
  userLocation?: Coordinate;
  priceLevels?: number[];
  minimumVotes?: number;
}

type RequestOptions = {
  signal?: AbortSignal;
};

export const searchService = {
  naturalSearch: async (
    payload: NaturalSearchRequest,
    options: RequestOptions = {}
  ): Promise<SearchResponse> => {
    const { data } = await api.post<SearchResponse>('/search/natural', payload, {
      signal: options.signal,
    });
    return data;
  },
  structuredSearch: async (
    payload: StructuredSearchRequest,
    options: RequestOptions = {}
  ): Promise<SearchResponse> => {
    const { data } = await api.post<SearchResponse>('/search/run', payload, {
      signal: options.signal,
    });
    return data;
  },
  recentHistory: async (limit = 8): Promise<string[]> => {
    const { data } = await api.get<string[]>('/search/history', {
      params: { limit },
    });
    return data;
  },
};

export type { NaturalSearchRequest, SearchResponse, StructuredSearchRequest };
