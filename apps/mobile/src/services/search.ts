import type {
  Coordinate,
  EntityScope,
  MapBounds,
  NaturalSearchRequest,
  OperatingStatus,
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
  submissionSource?: NaturalSearchRequest['submissionSource'];
  submissionContext?: NaturalSearchRequest['submissionContext'];
  sourceQuery?: string;
}

export type RecentSearch = {
  queryText: string;
  lastSearchedAt: string;
  selectedEntityId?: string | null;
  selectedEntityType?: EntityScope | null;
};

export type RecentlyViewedRestaurant = {
  restaurantId: string;
  restaurantName: string;
  city?: string | null;
  region?: string | null;
  lastViewedAt: string;
  viewCount: number;
};

export type RestaurantStatusPreview = {
  restaurantId: string;
  operatingStatus: OperatingStatus | null;
  distanceMiles: number | null;
  locationCount: number | null;
};

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
  recentHistory: async (limit = 8): Promise<RecentSearch[]> => {
    const { data } = await api.get<RecentSearch[]>('/search/history', {
      params: { limit },
    });
    return data;
  },
  recentlyViewedRestaurants: async (limit = 10): Promise<RecentlyViewedRestaurant[]> => {
    const { data } = await api.get<RecentlyViewedRestaurant[]>('/history/restaurants/viewed', {
      params: { limit },
    });
    return data;
  },
  restaurantStatusPreviews: async (payload: {
    restaurantIds: string[];
    userLocation?: Coordinate;
  }): Promise<RestaurantStatusPreview[]> => {
    const { data } = await api.post<RestaurantStatusPreview[]>(
      '/search/restaurant-status',
      payload
    );
    return data;
  },
  recordRestaurantView: async (payload: {
    restaurantId: string;
    searchRequestId?: string;
    source?: 'search_suggestion' | 'results_sheet' | 'auto_open_single_candidate' | 'autocomplete';
  }): Promise<void> => {
    await api.post('/history/restaurants/viewed', payload);
  },
};

export type { NaturalSearchRequest, SearchResponse, StructuredSearchRequest };
