import type {
  Coordinate,
  EntityScope,
  FoodResult,
  MapBounds,
  NaturalSearchRequest,
  OperatingStatus,
  Pagination,
  RestaurantProfile,
  SearchResponse,
} from '../types';
import type { FeatureCollection, Point } from 'geojson';
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
  searchRequestId?: string;
  scoreMode?: NaturalSearchRequest['scoreMode'];
  compactResponse?: boolean;
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

export type RecentlyViewedFood = {
  connectionId: string;
  foodId: string;
  foodName: string;
  restaurantId: string;
  restaurantName: string;
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

type CachedSearchEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

const SEARCH_CACHE_TTL_MS = 45 * 1000;
const naturalSearchCache = new Map<string, CachedSearchEntry<SearchResponse>>();
const structuredSearchCache = new Map<string, CachedSearchEntry<SearchResponse>>();
const restaurantProfileCache = new Map<string, CachedSearchEntry<RestaurantProfile>>();

const getPerfNow = () => {
  if (typeof performance?.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const normalizeSearchCacheValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => normalizeSearchCacheValue(item))
      .filter((item) => item !== undefined);
    return normalized.length > 0 ? normalized : undefined;
  }
  if (value && typeof value === 'object') {
    const normalizedEntries = Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => [key, normalizeSearchCacheValue(entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    if (!normalizedEntries.length) {
      return undefined;
    }
    return Object.fromEntries(normalizedEntries);
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  return value;
};

const buildSearchCacheKey = (payload: unknown): string =>
  JSON.stringify(normalizeSearchCacheValue(payload) ?? {});

const getCachedRequest = <T>(
  cache: Map<string, CachedSearchEntry<T>>,
  key: string,
  load: () => Promise<T>
): Promise<T> => {
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    return existing.promise;
  }
  const promise = load().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { expiresAt: now + SEARCH_CACHE_TTL_MS, promise });
  return promise;
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
    const cacheKey = buildSearchCacheKey({
      kind: 'natural',
      payload,
    });
    return getCachedRequest(naturalSearchCache, cacheKey, async () => {
      const transformResponse = options.debugParse
        ? buildDebugTransform(options.debugLabel ?? 'natural', options.debugMinMs ?? 0)
        : undefined;
      const { data } = await api.post<SearchResponse>('/search/natural', payload, {
        signal: options.signal,
        transformResponse,
      });
      return data;
    });
  },
  structuredSearch: async (
    payload: StructuredSearchRequest,
    options: RequestOptions = {}
  ): Promise<SearchResponse> => {
    const cacheKey = buildSearchCacheKey({
      kind: 'structured',
      payload,
    });
    return getCachedRequest(structuredSearchCache, cacheKey, async () => {
      const transformResponse = options.debugParse
        ? buildDebugTransform(options.debugLabel ?? 'structured', options.debugMinMs ?? 0)
        : undefined;
      const { data } = await api.post<SearchResponse>('/search/run', payload, {
        signal: options.signal,
        transformResponse,
      });
      return data;
    });
  },
  shortcutCoverage: async (payload: {
    entities?: StructuredSearchRequest['entities'];
    bounds: MapBounds;
    includeTopDish?: boolean;
    scoreMode?: NaturalSearchRequest['scoreMode'];
  }): Promise<FeatureCollection<Point>> => {
    const { data } = await api.post<FeatureCollection<Point>>('/search/shortcut/coverage', payload);
    return data;
  },
  restaurantDishes: async (restaurantId: string): Promise<FoodResult[]> => {
    const { data } = await api.get<FoodResult[]>(`/search/restaurants/${restaurantId}/dishes`);
    return data;
  },
  restaurantProfile: async (restaurantId: string): Promise<RestaurantProfile> => {
    return getCachedRequest(restaurantProfileCache, restaurantId, async () => {
      const { data } = await api.get<RestaurantProfile>(
        `/search/restaurants/${restaurantId}/profile`
      );
      return data;
    });
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
  recentlyViewedFoods: async (limit = 10): Promise<RecentlyViewedFood[]> => {
    const { data } = await api.get<RecentlyViewedFood[]>('/history/foods/viewed', {
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
  recordFoodView: async (payload: {
    connectionId: string;
    foodId?: string;
    searchRequestId?: string;
    source?: 'search_suggestion' | 'results_sheet' | 'auto_open_single_candidate' | 'autocomplete';
  }): Promise<void> => {
    await api.post('/history/foods/viewed', payload);
  },
};

export type { NaturalSearchRequest, SearchResponse };
