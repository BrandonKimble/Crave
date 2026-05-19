import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';
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
import { logPerfScenarioSearchRequestLifecycle } from '../perf/perf-scenario-attribution';
import { getPerfScenarioWorkNow, logPerfScenarioWorkSpan } from '../perf/perf-scenario-work-span';
import api from './api';
import type { ApiRequestBehaviorConfig } from './api';

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
  onCacheStatus?: (status: SearchRequestCacheStatus) => void;
};

type OptionalAuthRequestConfig = AxiosRequestConfig & ApiRequestBehaviorConfig;

const OPTIONAL_AUTH_REQUEST_CONFIG: OptionalAuthRequestConfig = {
  suppressSystemStatus: true,
  suppressErrorLog: true,
};

type CachedSearchEntry<T> = {
  createdAt: number;
  expiresAt: number;
  promise: Promise<T>;
  settled: boolean;
};

type CachedRequestOptions = {
  reuseInFlight?: boolean;
  onCacheStatus?: (status: SearchRequestCacheStatus) => void;
  cacheable?: boolean;
  ttlMs?: number;
  maxEntries?: number;
};

export type SearchRequestCacheDataReadyFrom = 'network' | 'cache' | 'in_flight';

export type SearchRequestCacheStatus = {
  dataReadyFrom: SearchRequestCacheDataReadyFrom;
  searchInputKey: string;
  cacheKeyHash: string;
  cacheAgeMs: number | null;
  cacheExpiresInMs: number | null;
  cachePromiseSettled: boolean | null;
};

type SearchRequestLifecycleContext = {
  kind: 'natural' | 'structured';
  cacheKeyHash: string;
  endpoint: string;
  payloadPage: number | null;
  payloadSearchRequestId: string | null;
  submissionSource: NaturalSearchRequest['submissionSource'] | null;
  submissionContext: NaturalSearchRequest['submissionContext'] | null;
  payloadBoundsSummary: Record<string, unknown>;
  queryLength: number | null;
  sourceQueryLength: number | null;
};

const SEARCH_PAGE_ONE_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_PAGE_ONE_CACHE_MAX_ENTRIES = 25;
const RESTAURANT_PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;
const RESTAURANT_PROFILE_CACHE_MAX_ENTRIES = 50;
const naturalSearchCache = new Map<string, CachedSearchEntry<SearchResponse>>();
const structuredSearchCache = new Map<string, CachedSearchEntry<SearchResponse>>();
const restaurantProfileCache = new Map<string, CachedSearchEntry<RestaurantProfile>>();

const normalizeSearchCacheValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => normalizeSearchCacheValue(item))
      .filter((item) => item !== undefined);
    return normalized.length > 0 ? normalized : undefined;
  }
  if (value && typeof value === 'object') {
    const normalizedEntries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'searchRequestId')
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

const hashSearchCacheKey = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const createClientSearchRequestId = (): string => {
  const nativeRandomUuid =
    typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : null;
  if (nativeRandomUuid) {
    return nativeRandomUuid;
  }

  const hex = (length: number): string => {
    let output = '';
    while (output.length < length) {
      output += Math.floor(Math.random() * 0x100000000)
        .toString(16)
        .padStart(8, '0');
    }
    return output.slice(0, length);
  };

  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(
    3
  )}-${hex(12)}`;
};

const readStringField = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const readCoordinateField = (
  value: unknown
): { lat: number; lng: number } | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const lat = record.lat;
  const lng = record.lng;
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }
  return { lat, lng };
};

const readRequestBoundsSummary = (payloadRecord: Record<string, unknown>): Record<string, unknown> => {
  const bounds = payloadRecord.bounds;
  if (!bounds || typeof bounds !== 'object' || Array.isArray(bounds)) {
    return { payloadHasBounds: false };
  }
  const boundsRecord = bounds as Record<string, unknown>;
  const northEast = readCoordinateField(boundsRecord.northEast);
  const southWest = readCoordinateField(boundsRecord.southWest);
  if (!northEast || !southWest) {
    return { payloadHasBounds: false };
  }
  return {
    payloadHasBounds: true,
    payloadBoundsNorthEastLat: northEast.lat,
    payloadBoundsNorthEastLng: northEast.lng,
    payloadBoundsSouthWestLat: southWest.lat,
    payloadBoundsSouthWestLng: southWest.lng,
    payloadBoundsCenterLat: Number(((northEast.lat + southWest.lat) / 2).toFixed(6)),
    payloadBoundsCenterLng: Number(((northEast.lng + southWest.lng) / 2).toFixed(6)),
  };
};

const readPaginationPage = (record: Record<string, unknown>): number | null => {
  const pagination = record.pagination;
  if (!pagination || typeof pagination !== 'object' || Array.isArray(pagination)) {
    return null;
  }
  const page = (pagination as Record<string, unknown>).page;
  return typeof page === 'number' && Number.isFinite(page) ? page : null;
};

const isPageOneSearchPayload = (payload: unknown): boolean => {
  const payloadRecord =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const page = readPaginationPage(payloadRecord);
  return page == null || page === 1;
};

const readSubmissionSource = (
  payloadRecord: Record<string, unknown>
): NaturalSearchRequest['submissionSource'] | null => {
  const value = payloadRecord.submissionSource;
  return value === 'manual' ||
    value === 'recent' ||
    value === 'autocomplete' ||
    value === 'shortcut'
    ? value
    : null;
};

const readSubmissionContext = (
  payloadRecord: Record<string, unknown>
): NaturalSearchRequest['submissionContext'] | null => {
  const value = payloadRecord.submissionContext;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as NaturalSearchRequest['submissionContext'])
    : null;
};

const createSearchRequestLifecycleContext = (
  kind: 'natural' | 'structured',
  endpoint: string,
  payload: unknown,
  cacheKey: string
): SearchRequestLifecycleContext => {
  const payloadRecord =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const query = readStringField(payloadRecord, 'query');
  const sourceQuery = readStringField(payloadRecord, 'sourceQuery');
  return {
    kind,
    endpoint,
    cacheKeyHash: hashSearchCacheKey(cacheKey),
    payloadPage: readPaginationPage(payloadRecord),
    payloadSearchRequestId: readStringField(payloadRecord, 'searchRequestId'),
    submissionSource: readSubmissionSource(payloadRecord),
    submissionContext: readSubmissionContext(payloadRecord),
    payloadBoundsSummary: readRequestBoundsSummary(payloadRecord),
    queryLength: query == null ? null : query.length,
    sourceQueryLength: sourceQuery == null ? null : sourceQuery.length,
  };
};

const getAxiosLifecycleErrorFields = (error: unknown): Record<string, unknown> => {
  if (!axios.isAxiosError(error)) {
    return {
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : 'unknown error',
    };
  }
  const code = typeof error.code === 'string' ? error.code : null;
  return {
    errorName: error.name,
    errorCode: code,
    errorMessage: error.message,
    status: typeof error.response?.status === 'number' ? error.response.status : null,
    aborted: axios.isCancel(error) || code === 'ERR_CANCELED',
    timedOut: code === 'ECONNABORTED' || code === 'ETIMEDOUT',
  };
};

const logSearchServiceLifecycle = (
  phase: string,
  context: SearchRequestLifecycleContext,
  payload: Record<string, unknown> = {}
): void => {
  logPerfScenarioSearchRequestLifecycle({
    source: 'searchService',
    phase,
    kind: context.kind,
    endpoint: context.endpoint,
    cacheKeyHash: context.cacheKeyHash,
    payloadSearchRequestId: context.payloadSearchRequestId,
    payloadPage: context.payloadPage,
    ...context.payloadBoundsSummary,
    queryLength: context.queryLength,
    sourceQueryLength: context.sourceQueryLength,
    ...payload,
  });
};

const readSearchResponseRequestId = (value: unknown): string | null => {
  const response =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { metadata?: { searchRequestId?: unknown } })
      : null;
  return typeof response?.metadata?.searchRequestId === 'string'
    ? response.metadata.searchRequestId
    : null;
};

const cloneSearchResponseForCacheReveal = <T>(
  value: T,
  cacheRevealRequestId: string,
  dataReadyFrom: Exclude<SearchRequestCacheDataReadyFrom, 'network'>
): T => {
  const response =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { metadata?: Record<string, unknown> })
      : null;
  const originalBackendSearchRequestId = readSearchResponseRequestId(value);
  if (!response?.metadata || !originalBackendSearchRequestId) {
    return value;
  }
  return {
    ...(value as Record<string, unknown>),
    metadata: {
      ...response.metadata,
      searchRequestId: cacheRevealRequestId,
      originalBackendSearchRequestId,
      dataReadyFrom,
    },
  } as T;
};

const maybeRecordSearchCacheAttribution = async (
  value: unknown,
  context: SearchRequestLifecycleContext,
  cacheAgeMs: number,
  cacheRevealRequestId: string
): Promise<void> => {
  const originalBackendSearchRequestId = readSearchResponseRequestId(value);

  if (!originalBackendSearchRequestId || originalBackendSearchRequestId === cacheRevealRequestId) {
    return;
  }
  const payload: Record<string, unknown> = {
    originalBackendSearchRequestId,
    cacheAgeMs,
    resultsDataKey: context.cacheKeyHash,
    submissionSource: context.submissionSource,
    submissionContext: context.submissionContext,
  };
  if (cacheRevealRequestId) {
    payload.cacheRevealRequestId = cacheRevealRequestId;
  }

  try {
    await api.post('/search/cache-attribution', payload, OPTIONAL_AUTH_REQUEST_CONFIG);
    logSearchServiceLifecycle('cache_attribution_recorded', context, {
      originalBackendSearchRequestId,
      cacheRevealRequestId,
      cacheAgeMs,
    });
  } catch (error) {
    logSearchServiceLifecycle('cache_attribution_error', context, {
      ...getAxiosLifecycleErrorFields(error),
      originalBackendSearchRequestId,
      cacheRevealRequestId,
      cacheAgeMs,
    });
  }
};

const pruneExpiredCacheEntries = <T>(cache: Map<string, CachedSearchEntry<T>>, now: number) => {
  for (const [cacheKey, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(cacheKey);
    }
  }
};

const enforceCacheMaxEntries = <T>(
  cache: Map<string, CachedSearchEntry<T>>,
  maxEntries: number | undefined
) => {
  if (maxEntries == null || maxEntries <= 0) {
    return;
  }
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== 'string') {
      break;
    }
    cache.delete(oldestKey);
  }
};

const getCachedRequest = <T>(
  cache: Map<string, CachedSearchEntry<T>>,
  key: string,
  load: () => Promise<T>,
  lifecycleContext?: SearchRequestLifecycleContext,
  options: CachedRequestOptions = {}
): Promise<T> => {
  const now = Date.now();
  pruneExpiredCacheEntries(cache, now);
  const cacheable = options.cacheable !== false;
  if (!cacheable) {
    if (lifecycleContext) {
      logSearchServiceLifecycle('cache_bypassed', lifecycleContext, {
        reason: 'non_page_one_request',
      });
    }
    options.onCacheStatus?.({
      dataReadyFrom: 'network',
      searchInputKey: lifecycleContext?.cacheKeyHash ?? hashSearchCacheKey(key),
      cacheKeyHash: lifecycleContext?.cacheKeyHash ?? hashSearchCacheKey(key),
      cacheAgeMs: null,
      cacheExpiresInMs: null,
      cachePromiseSettled: null,
    });
    return load();
  }
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    const shouldReuseEntry = existing.settled || options.reuseInFlight !== false;
    if (shouldReuseEntry) {
      cache.delete(key);
      cache.set(key, existing);
      options.onCacheStatus?.({
        dataReadyFrom: existing.settled ? 'cache' : 'in_flight',
        searchInputKey: lifecycleContext?.cacheKeyHash ?? hashSearchCacheKey(key),
        cacheKeyHash: lifecycleContext?.cacheKeyHash ?? hashSearchCacheKey(key),
        cacheAgeMs: now - existing.createdAt,
        cacheExpiresInMs: existing.expiresAt - now,
        cachePromiseSettled: existing.settled,
      });
      if (lifecycleContext) {
        logSearchServiceLifecycle(
          existing.settled ? 'cache_hit_settled_response' : 'cache_hit_reused_promise',
          lifecycleContext,
          {
            cacheAgeMs: now - existing.createdAt,
            cacheExpiresInMs: existing.expiresAt - now,
            cachePromiseSettled: existing.settled,
          }
        );
      }
      if (lifecycleContext) {
        const cacheAgeMs = now - existing.createdAt;
        const dataReadyFrom = existing.settled ? 'cache' : 'in_flight';
        const cacheRevealRequestId =
          lifecycleContext.payloadSearchRequestId ?? createClientSearchRequestId();
        return existing.promise.then((value) => {
          if (existing.settled) {
            void maybeRecordSearchCacheAttribution(
              value,
              lifecycleContext,
              cacheAgeMs,
              cacheRevealRequestId
            );
          }
          return cloneSearchResponseForCacheReveal(value, cacheRevealRequestId, dataReadyFrom);
        });
      }
      return existing.promise;
    }
    if (lifecycleContext) {
      logSearchServiceLifecycle('cache_hit_reused_promise', lifecycleContext, {
        cacheAgeMs: now - existing.createdAt,
        cacheExpiresInMs: existing.expiresAt - now,
        cachePromiseSettled: existing.settled,
        cacheReuseSkipped: true,
        reason: 'in_flight_request_has_independent_abort_signal',
      });
    }
  }
  if (lifecycleContext) {
    logSearchServiceLifecycle(existing ? 'cache_expired' : 'cache_miss', lifecycleContext);
  }
  options.onCacheStatus?.({
    dataReadyFrom: 'network',
    searchInputKey: lifecycleContext?.cacheKeyHash ?? hashSearchCacheKey(key),
    cacheKeyHash: lifecycleContext?.cacheKeyHash ?? hashSearchCacheKey(key),
    cacheAgeMs: existing ? now - existing.createdAt : null,
    cacheExpiresInMs: existing ? existing.expiresAt - now : null,
    cachePromiseSettled: existing?.settled ?? null,
  });
  const entryRef = { current: null as CachedSearchEntry<T> | null };
  const rawPromise = load().catch((error) => {
    if (lifecycleContext) {
      logSearchServiceLifecycle('cache_load_error', lifecycleContext, {
        ...getAxiosLifecycleErrorFields(error),
      });
    }
    if (entryRef.current != null && cache.get(key) === entryRef.current) {
      cache.delete(key);
    }
    throw error;
  });
  const entry: CachedSearchEntry<T> = {
    createdAt: now,
    expiresAt: now + (options.ttlMs ?? SEARCH_PAGE_ONE_CACHE_TTL_MS),
    promise: rawPromise,
    settled: false,
  };
  entryRef.current = entry;
  entry.promise = rawPromise.then(
    (value) => {
      entry.settled = true;
      if (lifecycleContext) {
        logSearchServiceLifecycle('cache_load_response', lifecycleContext);
      }
      return value;
    },
    (error) => {
      entry.settled = true;
      throw error;
    }
  );
  cache.set(key, entry);
  enforceCacheMaxEntries(cache, options.maxEntries);
  return entry.promise;
};

const buildDebugTransform = (label: string, minMs: number) => [
  (data: string | object) => {
    if (typeof data !== 'string') {
      return data;
    }
    const start = getPerfScenarioWorkNow();
    const parsed = JSON.parse(data);
    const duration = getPerfScenarioWorkNow() - start;
    logPerfScenarioWorkSpan({
      owner: 'search_service_transform_response_parse',
      path: label,
      startedAtMs: start,
      details: {
        bytes: data.length,
      },
    });
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
    const lifecycleContext = createSearchRequestLifecycleContext(
      'natural',
      '/search/natural',
      payload,
      cacheKey
    );
    return getCachedRequest(
      naturalSearchCache,
      cacheKey,
      async () => {
        const transformResponse = options.debugParse
          ? buildDebugTransform(options.debugLabel ?? 'natural', options.debugMinMs ?? 0)
          : undefined;
        logSearchServiceLifecycle('http_start', lifecycleContext);
        const requestStartedAtMs = getPerfScenarioWorkNow();
        try {
          const { data } = await api.post<SearchResponse>('/search/natural', payload, {
            signal: options.signal,
            transformResponse,
          });
          logPerfScenarioWorkSpan({
            owner: 'search_service_http_await',
            path: 'natural',
            startedAtMs: requestStartedAtMs,
            details: {
              responseDishCount: data.dishes?.length ?? 0,
              responseRestaurantCount: data.restaurants?.length ?? 0,
            },
          });
          logSearchServiceLifecycle('http_response', lifecycleContext, {
            responseSearchRequestId: data.metadata?.searchRequestId ?? null,
            responsePage: data.metadata?.page ?? null,
            responseDishCount: data.dishes?.length ?? 0,
            responseRestaurantCount: data.restaurants?.length ?? 0,
          });
          return data;
        } catch (error) {
          logSearchServiceLifecycle('http_error', lifecycleContext, {
            ...getAxiosLifecycleErrorFields(error),
          });
          throw error;
        }
      },
      lifecycleContext,
      {
        cacheable: isPageOneSearchPayload(payload),
        ttlMs: SEARCH_PAGE_ONE_CACHE_TTL_MS,
        maxEntries: SEARCH_PAGE_ONE_CACHE_MAX_ENTRIES,
        reuseInFlight: options.signal == null,
        onCacheStatus: options.onCacheStatus,
      }
    );
  },
  structuredSearch: async (
    payload: StructuredSearchRequest,
    options: RequestOptions = {}
  ): Promise<SearchResponse> => {
    const cacheKey = buildSearchCacheKey({
      kind: 'structured',
      payload,
    });
    const lifecycleContext = createSearchRequestLifecycleContext(
      'structured',
      '/search/run',
      payload,
      cacheKey
    );
    return getCachedRequest(
      structuredSearchCache,
      cacheKey,
      async () => {
        const transformResponse = options.debugParse
          ? buildDebugTransform(options.debugLabel ?? 'structured', options.debugMinMs ?? 0)
          : undefined;
        logSearchServiceLifecycle('http_start', lifecycleContext);
        const requestStartedAtMs = getPerfScenarioWorkNow();
        try {
          const { data } = await api.post<SearchResponse>('/search/run', payload, {
            signal: options.signal,
            transformResponse,
          });
          logPerfScenarioWorkSpan({
            owner: 'search_service_http_await',
            path: 'structured',
            startedAtMs: requestStartedAtMs,
            details: {
              responseDishCount: data.dishes?.length ?? 0,
              responseRestaurantCount: data.restaurants?.length ?? 0,
            },
          });
          logSearchServiceLifecycle('http_response', lifecycleContext, {
            responseSearchRequestId: data.metadata?.searchRequestId ?? null,
            responsePage: data.metadata?.page ?? null,
            responseDishCount: data.dishes?.length ?? 0,
            responseRestaurantCount: data.restaurants?.length ?? 0,
          });
          return data;
        } catch (error) {
          logSearchServiceLifecycle('http_error', lifecycleContext, {
            ...getAxiosLifecycleErrorFields(error),
          });
          throw error;
        }
      },
      lifecycleContext,
      {
        cacheable: isPageOneSearchPayload(payload),
        ttlMs: SEARCH_PAGE_ONE_CACHE_TTL_MS,
        maxEntries: SEARCH_PAGE_ONE_CACHE_MAX_ENTRIES,
        reuseInFlight: options.signal == null,
        onCacheStatus: options.onCacheStatus,
      }
    );
  },
  shortcutCoverage: async (
    payload: {
      entities?: StructuredSearchRequest['entities'];
      bounds: MapBounds;
      includeTopDish?: boolean;
      marketKey?: string | null;
    },
    options: Pick<RequestOptions, 'signal'> = {}
  ): Promise<FeatureCollection<Point>> => {
    const { data } = await api.post<FeatureCollection<Point>>(
      '/search/shortcut/coverage',
      payload,
      {
        signal: options.signal,
      }
    );
    return data;
  },
  restaurantDishes: async (restaurantId: string): Promise<FoodResult[]> => {
    const { data } = await api.get<FoodResult[]>(`/search/restaurants/${restaurantId}/dishes`);
    return data;
  },
  restaurantProfile: async (
    restaurantId: string,
    options: { marketKey?: string | null } = {}
  ): Promise<RestaurantProfile> => {
    const normalizedMarketKey =
      typeof options.marketKey === 'string' && options.marketKey.trim().length
        ? options.marketKey.trim().toLowerCase()
        : null;
    const cacheKey = buildSearchCacheKey({
      kind: 'restaurant-profile',
      restaurantId,
      marketKey: normalizedMarketKey,
    });
    return getCachedRequest(
      restaurantProfileCache,
      cacheKey,
      async () => {
        const { data } = await api.get<RestaurantProfile>(
          `/search/restaurants/${restaurantId}/profile`,
          {
            params: normalizedMarketKey ? { marketKey: normalizedMarketKey } : undefined,
          }
        );
        return data;
      },
      undefined,
      {
        ttlMs: RESTAURANT_PROFILE_CACHE_TTL_MS,
        maxEntries: RESTAURANT_PROFILE_CACHE_MAX_ENTRIES,
      }
    );
  },
  recentHistory: async (limit = 8): Promise<RecentSearch[]> => {
    const { data } = await api.get<RecentSearch[]>('/search/history', {
      params: { limit },
      ...OPTIONAL_AUTH_REQUEST_CONFIG,
    } satisfies OptionalAuthRequestConfig);
    return data;
  },
  recentlyViewedRestaurants: async (limit = 10): Promise<RecentlyViewedRestaurant[]> => {
    const { data } = await api.get<RecentlyViewedRestaurant[]>('/history/restaurants/viewed', {
      params: { limit },
      ...OPTIONAL_AUTH_REQUEST_CONFIG,
    } satisfies OptionalAuthRequestConfig);
    return data;
  },
  recentlyViewedFoods: async (limit = 10): Promise<RecentlyViewedFood[]> => {
    const { data } = await api.get<RecentlyViewedFood[]>('/history/foods/viewed', {
      params: { limit },
      ...OPTIONAL_AUTH_REQUEST_CONFIG,
    } satisfies OptionalAuthRequestConfig);
    return data;
  },
  recordRestaurantView: async (payload: {
    restaurantId: string;
    searchRequestId?: string;
    source?: 'search_suggestion' | 'results_sheet' | 'auto_open_single_candidate' | 'autocomplete';
  }): Promise<void> => {
    await api.post('/history/restaurants/viewed', payload, OPTIONAL_AUTH_REQUEST_CONFIG);
  },
  recordFoodView: async (payload: {
    connectionId: string;
    foodId?: string;
    searchRequestId?: string;
    source?: 'search_suggestion' | 'results_sheet' | 'auto_open_single_candidate' | 'autocomplete';
  }): Promise<void> => {
    await api.post('/history/foods/viewed', payload, OPTIONAL_AUTH_REQUEST_CONFIG);
  },
};

export type { NaturalSearchRequest, SearchResponse };
