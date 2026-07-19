// The IDENTITY→FETCH TABLE (S3 edit map §2): a desired tuple becomes a network request
// and its response becomes a world value. The payload is built FROM THE TUPLE ONLY —
// bounds and polygon from committedBounds (adopted at the commit moment by the writer),
// filters from filterVariant, the query from the identity. The resolver never touches
// the map ref or reads filters from anywhere else.
//
// S3a routes the chip-rerun identities (natural + shortcut). The remaining kinds join
// per strangler sub-stage (entities/entity in S3c, profileSeed as local synthesis);
// until then an unrouted kind throws LOUDLY — the legacy lane still owns it.

import type { Coordinate, NaturalSearchRequest, SearchResponse } from '../../../../types';
import type {
  SearchRequestCacheStatus,
  StructuredSearchRequest,
} from '../../../../services/search';
import { DEFAULT_PAGE_SIZE } from '../../constants/search';
import type { SearchDesiredTuple } from '../shared/search-desired-state-contract';
import { constructSearchWorldValue } from './search-world-value-constructor';
import type { SearchWorldNetworkFetchResult } from './search-world-resolver';
import {
  fetchShortcutCoverageWorldEntry,
  type ShortcutCoverageService,
} from './shortcut-coverage-world';
import {
  resolveFavoritesAdoptedTab,
  resolveNaturalResponseAdoptedTab,
} from './natural-response-presentation';
import { resolveSingleRestaurantCandidate } from '../../utils/response';

export type SearchWorldRunSearch = (
  request:
    | {
        kind: 'natural';
        payload: NaturalSearchRequest;
        onCacheStatus?: (status: SearchRequestCacheStatus) => void;
      }
    | {
        kind: 'structured';
        payload: StructuredSearchRequest;
        onCacheStatus?: (status: SearchRequestCacheStatus) => void;
      }
) => Promise<SearchResponse | null>;

export type SearchWorldFetchEnv = {
  runSearch: SearchWorldRunSearch;
  userLocationRef: { current: Coordinate | null };
  /** Shortcut identities fetch coverage (both tabs) in PARALLEL with the cards — the
   *  world lands atomic (S1 invariant) and the frame never waits on a relay. */
  shortcutCoverage: ShortcutCoverageService;
  /** Favorites-as-search: the list identity's fetch (no LLM, no bounds —
   *  the results define the camera). */
  getFavoritesListResults: (
    listId: string,
    options: {
      openNow?: boolean;
      userLocation?: Coordinate;
      targetUserId?: string | null;
      shareSlug?: string | null;
      /** Wave-4 §3 strip 'world' flip: the list-strip's full slice rides the world. */
      sort?: 'custom' | 'best' | 'recent';
      priceLevels?: number[];
      marketKey?: string | null;
    }
  ) => Promise<SearchResponse | null>;
};

const attachTupleScopeToPayload = (
  payload: NaturalSearchRequest | StructuredSearchRequest,
  tuple: SearchDesiredTuple,
  userLocation: Coordinate | null
): void => {
  const filters = tuple.filterVariant;
  if (filters.openNow) {
    payload.openNow = true;
  }
  if (filters.priceLevels.length > 0) {
    payload.priceLevels = [...filters.priceLevels];
  }
  // TODO(shared-types): send ALWAYS-EXPLICITLY once the API include-similar contract is
  // live on main (false suppresses env-default silent dense widening); today's backend
  // rejects unknown properties, so attach only when true.
  if (filters.includeSimilar) {
    payload.includeSimilar = true;
  }
  if (filters.rising) {
    payload.risingActive = true;
  }
  const committed = tuple.committedBounds;
  if (committed != null) {
    payload.bounds = committed.bounds;
    if (committed.viewportPolygon != null && committed.viewportPolygon.length >= 3) {
      payload.viewportPolygon = committed.viewportPolygon.map(
        ([lng, lat]) => [lng, lat] as [number, number]
      );
    }
  }
  if (userLocation != null) {
    payload.userLocation = userLocation;
  }
};

export const createSearchWorldFetcher =
  (env: SearchWorldFetchEnv) =>
  async (args: {
    tuple: SearchDesiredTuple;
    requestDecoration?: {
      submissionSource?: string;
      submissionContext?: Record<string, unknown>;
    };
  }): Promise<SearchWorldNetworkFetchResult> => {
    const { tuple, requestDecoration } = args;
    const identity = tuple.queryIdentity;
    const userLocation = env.userLocationRef.current;
    const cacheStatusRef: { current: SearchRequestCacheStatus | null } = { current: null };
    const onCacheStatus = (status: SearchRequestCacheStatus): void => {
      cacheStatusRef.current = status;
    };

    let response: SearchResponse | null = null;
    let coverageByTab: Partial<
      Record<
        'restaurants' | 'dishes',
        import('../shared/search-mounted-results-data-store').SearchMountedResultsCoverageEntry
      >
    > = {};
    if (identity.kind === 'shortcut') {
      const payload: StructuredSearchRequest = {
        entities: {},
        pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE },
        includeSqlPreview: false,
      };
      attachTupleScopeToPayload(payload, tuple, userLocation);
      // Viewport-only coverage (Leg 1): no market gate — coverage ALWAYS rides in
      // PARALLEL with the cards, first submit included.
      const [cardsResponse, restaurantsCoverage, dishesCoverage] = await Promise.all([
        env.runSearch({ kind: 'structured', payload, onCacheStatus }),
        fetchShortcutCoverageWorldEntry({
          shortcutCoverage: env.shortcutCoverage,
          tuple,
          tab: 'restaurants',
        }),
        fetchShortcutCoverageWorldEntry({
          shortcutCoverage: env.shortcutCoverage,
          tuple,
          tab: 'dishes',
        }),
      ]);
      response = cardsResponse;
      coverageByTab = { restaurants: restaurantsCoverage, dishes: dishesCoverage };
    } else if (identity.kind === 'natural') {
      const payload: NaturalSearchRequest = {
        query: identity.query,
        pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE },
        includeSqlPreview: false,
        submissionSource: (requestDecoration?.submissionSource ??
          'manual') as NaturalSearchRequest['submissionSource'],
      };
      if (requestDecoration?.submissionContext != null) {
        payload.submissionContext = requestDecoration.submissionContext;
      }
      attachTupleScopeToPayload(payload, tuple, userLocation);
      response = await env.runSearch({ kind: 'natural', payload, onCacheStatus });
    } else if (identity.kind === 'list') {
      response = await env.getFavoritesListResults(identity.listId, {
        openNow: tuple.filterVariant.openNow || undefined,
        userLocation: userLocation ?? undefined,
        // Virtual-All from ANOTHER user's surface: scope the union to the owner.
        targetUserId: identity.targetUserId ?? undefined,
        // RT-18: shared reads present the slug capability.
        shareSlug: identity.shareSlug ?? undefined,
        // Strip 'world' flip: the list-strip slice rides the tuple's filterVariant, so a
        // sort/price/market chip re-resolves the WORLD (map pins + cards re-slice together).
        sort: tuple.filterVariant.listSort,
        priceLevels:
          tuple.filterVariant.priceLevels.length > 0
            ? [...tuple.filterVariant.priceLevels]
            : undefined,
        marketKey: tuple.filterVariant.marketKey ?? undefined,
      });
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[FAVDBG] list-results', {
          restaurants: response?.restaurants?.length ?? 0,
          dishes: response?.dishes?.length ?? 0,
          notes: response?.plan?.diagnostics?.notes ?? null,
          favorites:
            (response?.metadata as { analysisMetadata?: { favorites?: unknown } } | undefined)
              ?.analysisMetadata?.favorites ?? null,
        });
      }
    } else if (identity.kind === 'entity') {
      // Skip-LLM entity lane: restaurant taps are a structured single-entity request;
      // food/attribute taps ride the natural endpoint with a selected-entity context the
      // backend routes through buildSelectedEntitySearchRequest (no LLM cost).
      const submissionContext = {
        // The REAL typed prefix rides the decoration when the trigger has one (recall
        // telemetry); the display name is the honest fallback.
        typedPrefix:
          (requestDecoration?.submissionContext?.typedPrefix as string | undefined) ??
          identity.displayName,
        matchType: 'entity',
        selectedEntityId: identity.entityId,
        selectedEntityType: identity.entityType,
      };
      if (identity.entityType === 'restaurant') {
        const payload: StructuredSearchRequest = {
          entities: {
            restaurants: [
              {
                normalizedName: identity.displayName,
                entityIds: [identity.entityId],
                originalText: identity.displayName,
              },
            ],
          },
          pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE },
          includeSqlPreview: false,
          sourceQuery: identity.displayName,
          submissionSource: 'autocomplete',
          submissionContext,
        };
        attachTupleScopeToPayload(payload, tuple, userLocation);
        response = await env.runSearch({ kind: 'structured', payload, onCacheStatus });
      } else {
        const payload: NaturalSearchRequest = {
          query: identity.displayName,
          pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE },
          includeSqlPreview: false,
          submissionSource: 'autocomplete',
          submissionContext,
        };
        attachTupleScopeToPayload(payload, tuple, userLocation);
        response = await env.runSearch({ kind: 'natural', payload, onCacheStatus });
      }
    } else {
      // Loud by design: this identity kind has not been routed to the resolver yet.
      throw new Error(`search-world-fetch: unrouted identity kind '${identity.kind}'`);
    }
    if (response == null) {
      throw new Error('search-world-fetch: runSearch returned no response');
    }
    // Natural/entity presentation facts derive from the RESPONSE (world metadata): the
    // adopted tab (marker projections must be computed for it) and the single-restaurant
    // collapse candidate. Entity taps feed their selected-entity context into the adopt
    // rule (the legacy resolveSubmissionDefaultTab lane).
    const adoptsFromResponse = identity.kind === 'natural' || identity.kind === 'entity';
    // Favorites suppress the single-restaurant collapse (a 1-restaurant list must keep
    // the list+toggle surface) and adopt via the list-axis rule.
    const singleRestaurantCandidate = adoptsFromResponse
      ? resolveSingleRestaurantCandidate(response)
      : null;
    const adoptSubmissionContext =
      identity.kind === 'entity'
        ? {
            matchType: 'entity',
            selectedEntityId: identity.entityId,
            selectedEntityType: identity.entityType,
          }
        : undefined;
    const adoptedTab = adoptsFromResponse
      ? singleRestaurantCandidate == null
        ? resolveNaturalResponseAdoptedTab({
            response,
            currentTab: tuple.tab,
            submissionContext: adoptSubmissionContext,
          })
        : 'restaurants'
      : identity.kind === 'list'
        ? resolveFavoritesAdoptedTab({
            response,
            listTab: identity.listType === 'dish' ? 'dishes' : 'restaurants',
          })
        : undefined;
    const value = constructSearchWorldValue({
      response,
      queryIdentity: identity,
      activeTab: adoptedTab ?? tuple.tab,
      bounds: tuple.committedBounds?.bounds ?? null,
      userLocation,
      preserveRouteIdentity: identity.kind !== 'shortcut',
    });
    value.coverageByTab = coverageByTab;
    value.singleRestaurantCandidate = singleRestaurantCandidate;
    return {
      value,
      adoptedTab,
      dataReadyFrom: cacheStatusRef.current?.dataReadyFrom ?? 'network',
      searchInputKey: cacheStatusRef.current?.searchInputKey ?? null,
    };
  };

/** Page-N fetch for the CURRENT world (S3 edit map §3): payload from the WORLD's
 *  identity inputs (tuple bounds pinned at page 1 — appends never chase the live
 *  camera), searchRequestId from the committed response so the backend serves the same
 *  result set. The merged value VERSIONS under the same identity. */
export const createSearchWorldNextPageFetcher =
  (env: SearchWorldFetchEnv) =>
  async (args: {
    tuple: SearchDesiredTuple;
    baseValue: import('./search-world-presentation-seam').SearchWorldValue;
    targetPage: number;
  }): Promise<SearchWorldNetworkFetchResult> => {
    const { tuple, baseValue, targetPage } = args;
    const identity = tuple.queryIdentity;
    const userLocation = env.userLocationRef.current;
    const cacheStatusRef: { current: SearchRequestCacheStatus | null } = { current: null };
    const onCacheStatus = (status: SearchRequestCacheStatus): void => {
      cacheStatusRef.current = status;
    };
    let response: SearchResponse | null = null;
    if (
      identity.kind === 'shortcut' ||
      (identity.kind === 'entity' && identity.entityType === 'restaurant')
    ) {
      const payload: StructuredSearchRequest = {
        entities:
          identity.kind === 'entity'
            ? {
                restaurants: [
                  {
                    normalizedName: identity.displayName,
                    entityIds: [identity.entityId],
                    originalText: identity.displayName,
                  },
                ],
              }
            : {},
        pagination: { page: targetPage, pageSize: DEFAULT_PAGE_SIZE },
        includeSqlPreview: false,
      };
      attachTupleScopeToPayload(payload, tuple, userLocation);
      response = await env.runSearch({ kind: 'structured', payload, onCacheStatus });
    } else if (identity.kind === 'natural' || identity.kind === 'entity') {
      const payload: NaturalSearchRequest = {
        query: identity.kind === 'natural' ? identity.query : identity.displayName,
        pagination: { page: targetPage, pageSize: DEFAULT_PAGE_SIZE },
        includeSqlPreview: false,
        searchRequestId: baseValue.searchRequestId,
      };
      attachTupleScopeToPayload(payload, tuple, userLocation);
      response = await env.runSearch({ kind: 'natural', payload, onCacheStatus });
    } else {
      // entities (favorites) return the whole list at once; profileSeed never paginates.
      throw new Error(`search-world-fetch: identity kind '${identity.kind}' cannot paginate`);
    }
    if (response == null) {
      throw new Error('search-world-fetch: next-page runSearch returned no response');
    }
    const value = constructSearchWorldValue({
      response,
      queryIdentity: identity,
      activeTab: tuple.tab,
      bounds: tuple.committedBounds?.bounds ?? null,
      userLocation,
      preserveRouteIdentity: identity.kind !== 'shortcut',
      appendTo: {
        baseResponse: baseValue.committedResponse,
        targetPage,
        prevIsPaginationExhausted: baseValue.paginationMeta.isPaginationExhausted,
      },
    });
    // The append inherits the page-1 world's coverage + presentation metadata — an
    // append never refetches coverage or re-decides the single-restaurant collapse.
    value.coverageByTab = baseValue.coverageByTab;
    value.singleRestaurantCandidate = baseValue.singleRestaurantCandidate;
    return {
      value,
      dataReadyFrom: cacheStatusRef.current?.dataReadyFrom ?? 'network',
      searchInputKey: cacheStatusRef.current?.searchInputKey ?? null,
    };
  };
