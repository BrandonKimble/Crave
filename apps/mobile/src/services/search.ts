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

export const searchService = {
  naturalSearch: async (payload: NaturalSearchRequest): Promise<SearchResponse> => {
    const { data } = await api.post<SearchResponse>('/search/natural', payload);
    return data;
  },
  structuredSearch: async (payload: StructuredSearchRequest): Promise<SearchResponse> => {
    const { data } = await api.post<SearchResponse>('/search/run', payload);
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
