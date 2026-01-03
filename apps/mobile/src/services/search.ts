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
  statusPreview?: RestaurantStatusPreview | null;
};

export type RecentlyViewedRestaurant = {
  restaurantId: string;
  restaurantName: string;
  city?: string | null;
  region?: string | null;
  lastViewedAt: string;
  viewCount: number;
  statusPreview?: RestaurantStatusPreview | null;
};

export type RestaurantStatusPreview = {
  restaurantId: string;
  operatingStatus: OperatingStatus | null;
  distanceMiles: number | null;
  locationCount: number | null;
};

type RequestOptions = {
  signal?: AbortSignal;
  debugParse?: boolean;
  debugLabel?: string;
  debugMinMs?: number;
};

const getPerfNow = () => {
  if (typeof performance?.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const buildDebugTransform = (label: string, minMs: number) => [
  (data: string | object) => {
    if (typeof data !== 'string') {
      return data;
    }
    const start = getPerfNow();
    const parsed = JSON.parse(data);
    const duration = getPerfNow() - start;
    if (__DEV__ && duration >= minMs) {
      // eslint-disable-next-line no-console
      console.log(`[SearchPerf] parse ${label} ${duration.toFixed(1)}ms bytes=${data.length}`);
    }
    return parsed;
  },
];

export const searchService = {
  naturalSearch: async (
    payload: NaturalSearchRequest,
    options: RequestOptions = {}
  ): Promise<SearchResponse> => {
    const transformResponse = options.debugParse
      ? buildDebugTransform(options.debugLabel ?? 'natural', options.debugMinMs ?? 0)
      : undefined;
    const { data } = await api.post<SearchResponse>('/search/natural', payload, {
      signal: options.signal,
      transformResponse,
    });
    return data;
  },
  structuredSearch: async (
    payload: StructuredSearchRequest,
    options: RequestOptions = {}
  ): Promise<SearchResponse> => {
    const transformResponse = options.debugParse
      ? buildDebugTransform(options.debugLabel ?? 'structured', options.debugMinMs ?? 0)
      : undefined;
    const { data } = await api.post<SearchResponse>('/search/run', payload, {
      signal: options.signal,
      transformResponse,
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
  recordRestaurantView: async (payload: {
    restaurantId: string;
    searchRequestId?: string;
    source?: 'search_suggestion' | 'results_sheet' | 'auto_open_single_candidate' | 'autocomplete';
  }): Promise<void> => {
    await api.post('/history/restaurants/viewed', payload);
  },
};

export type { NaturalSearchRequest, SearchResponse, StructuredSearchRequest };
