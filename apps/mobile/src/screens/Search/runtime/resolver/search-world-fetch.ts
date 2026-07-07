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
  getMarketKey: () => string;
  /** Favorites-as-search: the entities identity's list fetch (no LLM, no bounds —
   *  the results define the camera). */
  getFavoritesListResults: (
    listId: string,
    options: { openNow?: boolean; userLocation?: Coordinate }
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
  async (args: { tuple: SearchDesiredTuple }): Promise<SearchWorldNetworkFetchResult> => {
    const { tuple } = args;
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
      const fetchBothTabCoverage = async (marketKey: string) => {
        const [restaurantsCoverage, dishesCoverage] = await Promise.all([
          fetchShortcutCoverageWorldEntry({
            shortcutCoverage: env.shortcutCoverage,
            tuple,
            tab: 'restaurants',
            marketKey,
          }),
          fetchShortcutCoverageWorldEntry({
            shortcutCoverage: env.shortcutCoverage,
            tuple,
            tab: 'dishes',
            marketKey,
          }),
        ]);
        return { restaurants: restaurantsCoverage, dishes: dishesCoverage };
      };
      const knownMarketKey = env.getMarketKey();
      if (knownMarketKey) {
        // Market known (rerun / STA in the same market): coverage rides in PARALLEL.
        const [cardsResponse, coverage] = await Promise.all([
          env.runSearch({ kind: 'structured', payload, onCacheStatus }),
          fetchBothTabCoverage(knownMarketKey),
        ]);
        response = cardsResponse;
        coverageByTab = coverage;
      } else {
        // First submit in a market: the cards response resolves the market, coverage
        // follows — the same serialization the legacy post-response lane had.
        response = await env.runSearch({ kind: 'structured', payload, onCacheStatus });
        coverageByTab = await fetchBothTabCoverage(response?.metadata?.marketKey ?? '');
      }
    } else if (identity.kind === 'natural') {
      const payload: NaturalSearchRequest = {
        query: identity.query,
        pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE },
        includeSqlPreview: false,
        submissionSource: 'manual',
      };
      attachTupleScopeToPayload(payload, tuple, userLocation);
      response = await env.runSearch({ kind: 'natural', payload, onCacheStatus });
    } else if (identity.kind === 'entities') {
      if (identity.listId == null) {
        throw new Error('search-world-fetch: entities identity without a listId');
      }
      response = await env.getFavoritesListResults(identity.listId, {
        openNow: tuple.filterVariant.openNow || undefined,
        userLocation: userLocation ?? undefined,
      });
    } else if (identity.kind === 'entity') {
      // Skip-LLM entity lane: restaurant taps are a structured single-entity request;
      // food/attribute taps ride the natural endpoint with a selected-entity context the
      // backend routes through buildSelectedEntitySearchRequest (no LLM cost).
      const submissionContext = {
        typedPrefix: identity.displayName,
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
      : identity.kind === 'entities'
        ? resolveFavoritesAdoptedTab({
            response,
            listTab: identity.listType === 'dish' ? 'dishes' : 'restaurants',
          })
        : undefined;
    const value = constructSearchWorldValue({
      response,
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
