import React from 'react';

import type { UseSearchRequestsResult } from '../../../hooks/useSearchRequests';
import type { Coordinate, MapBounds, NaturalSearchRequest, SearchResponse } from '../../../types';
import type { RecentSearch, StructuredSearchRequest } from '../../../services/search';
import { favoriteListsService, type FavoriteListType } from '../../../services/favorite-lists';
import type { SegmentValue } from '../constants/search';
import type { MapboxMapRef } from '../components/search-map';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import type { RuntimeWorkScheduler } from '../runtime/scheduler/runtime-work-scheduler';
import type { ResultsPresentationAuthority } from '../runtime/shared/results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from '../runtime/shared/results-presentation-surface-authority';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import {
  useSearchSubmitEntryOwner,
  type SearchMode,
  type SearchSubmitEntrySurface,
  type SearchSubmitPresentationIntentKind,
  type SubmitSearchOptions,
  type SearchSubmitInPlaceRerunIntentKind,
  type StructuredSearchFilters,
} from './use-search-submit-entry-owner';
import { useSearchNaturalSubmitOwner } from './use-search-natural-submit-owner';
import { useSearchStructuredSubmitOwner } from './use-search-structured-submit-owner';
import { captureFreshCommittedBounds } from '../runtime/shared/search-fresh-bounds-capture';
import {
  createSearchWorldResolver,
  type SearchWorldResolveArgs,
} from '../runtime/resolver/search-world-resolver';
import { createSearchWorldPresentationSeam } from '../runtime/resolver/search-world-presentation-seam';
import {
  createSearchWorldFetcher,
  createSearchWorldNextPageFetcher,
} from '../runtime/resolver/search-world-fetch';
import { createSearchWorldDerivation } from '../runtime/resolver/search-world-derivation';
import { searchService } from '../../../services/search';
import { getSearchMountedResultsDataSnapshot } from '../runtime/shared/search-mounted-results-data-store';
import { useSearchSubmitActionOwner } from './use-search-submit-action-owner';
import type { SearchRequestRuntimeOwner } from './use-search-request-runtime-owner';
type SearchSubmitOwnerReadModel = {
  query: string;
  submittedQuery: string;
  hasResults: boolean;
  canLoadMore: boolean;
  currentPage: number;
  activeTab: SegmentValue;
  currentResults: SearchResponse | null;
  isPaginationExhausted: boolean;
  pendingTabSwitchTab: SegmentValue | null;
  preferredActiveTab: SegmentValue;
  hasActiveTabPreference: boolean;
  isLoadingMore: boolean;
  openNow: boolean;
  priceLevels: number[];
  risingActive: boolean;
};

type SearchSubmitOwnerUiPorts = {
  setActiveTab: React.Dispatch<React.SetStateAction<SegmentValue>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  resetSheetToHidden: () => void;
  scrollResultsToTop: () => void;
  isSearchEditingRef?: React.MutableRefObject<boolean>;
  resetMapMoveFlag: () => void;
  loadRecentHistory: (options?: { force?: boolean }) => Promise<void>;
  updateLocalRecentSearches: (value: string | RecentSearchInput) => void;
  getIsProfilePresentationActive?: () => boolean;
  clearMapHighlightedRestaurantId?: () => void;
  onPageOneResultsCommitted?: (payload: {
    searchRequestId: string | null;
    requestBounds: MapBounds | null;
    resultsIdentityKey: string | null;
    resultsDataKey: string | null;
    dataReadyFrom: 'network' | 'cache' | 'in_flight';
    searchInputKey: string | null;
    replaceResultsInPlace: boolean;
    presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
  }) => void;
  onShortcutSearchCoverageSnapshot?: (snapshot: {
    searchRequestId: string;
    bounds: MapBounds | null;
    entities: StructuredSearchRequest['entities'];
  }) => void;
  onPresentationIntentStart?: (params: {
    kind: SearchSubmitPresentationIntentKind;
    mode: SearchMode;
    preserveSheetState: boolean;
    transitionFromDockedPolls: boolean;
    targetTab: SegmentValue;
    submittedLabel?: string;
    entrySurface: SearchSubmitEntrySurface;
  }) => void;
  onPresentationIntentAbort?: () => void;
};

type SearchSubmitOwnerRuntimePorts = {
  runtimeWorkSchedulerRef?: React.MutableRefObject<RuntimeWorkScheduler> | null;
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  lastSearchRequestIdRef: React.MutableRefObject<string | null>;
  lastAutoOpenKeyRef: React.MutableRefObject<string | null>;
  runSearch: UseSearchRequestsResult['runSearch'];
  mapRef: React.RefObject<MapboxMapRef | null>;
  latestBoundsRef: React.MutableRefObject<MapBounds | null>;
  viewportBoundsService: ViewportBoundsService;
  userLocationRef: React.MutableRefObject<Coordinate | null>;
  requestRuntimeOwner: SearchRequestRuntimeOwner;
};

type UseSearchSubmitOwnerOptions = {
  readModel: SearchSubmitOwnerReadModel;
  uiPorts: SearchSubmitOwnerUiPorts;
  runtimePorts: SearchSubmitOwnerRuntimePorts;
};

type RecentSearchInput = {
  queryText: string;
  selectedEntityId?: string | null;
  selectedEntityType?: RecentSearch['selectedEntityType'] | null;
  statusPreview?: RecentSearch['statusPreview'] | null;
};

type SearchSubmitOwner = {
  submitSearch: (options?: SubmitSearchOptions, overrideQuery?: string) => Promise<void>;
  /** S3-pre: commit-moment settled-camera adopt for tuple writers (STA, chip reruns). */
  captureFreshTupleBounds: () => Promise<
    import('../runtime/shared/search-desired-state-contract').SearchCommittedBounds | null
  >;
  /** S3a: resolve the desired tuple through the world resolver (chip-cause reruns). */
  resolveDesiredWorld: (
    args: import('../runtime/resolver/search-world-resolver').SearchWorldResolveArgs
  ) => Promise<void>;
  worldResolverIsResolving: () => boolean;
  runRestaurantEntitySearch: (params: {
    restaurantId: string;
    restaurantName: string;
    submissionSource: NaturalSearchRequest['submissionSource'];
    typedPrefix?: string;
    preserveSheetState?: boolean;
    entrySurface: SearchSubmitEntrySurface;
  }) => Promise<void>;
  submitViewportShortcut: (
    targetTab: SegmentValue,
    submittedLabel: string,
    options: {
      preserveSheetState?: boolean;
      replaceResultsInPlace?: boolean;
      transitionFromDockedPolls?: boolean;
      filters?: StructuredSearchFilters;
      forceFreshBounds?: boolean;
      presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
      entrySurface: SearchSubmitEntrySurface;
    }
  ) => Promise<void>;
  rerunActiveSearch: (params: {
    searchMode: SearchMode;
    activeTab: SegmentValue;
    submittedQuery: string;
    query: string;
    isSearchSessionActive: boolean;
    preserveSheetState?: boolean;
    replaceResultsInPlace?: boolean;
    filters?: StructuredSearchFilters;
    presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
  }) => Promise<void>;
  loadMoreResults: (searchMode: SearchMode) => void;
  launchFavoritesListResults: (params: {
    listId: string;
    listType: FavoriteListType;
    submittedLabel: string;
  }) => Promise<void>;
  launchEntitySearchResults: (params: {
    entityId: string;
    entityType: 'food' | 'food_attribute' | 'restaurant_attribute';
    submittedLabel: string;
  }) => Promise<void>;
};

const useSearchSubmitOwner = ({
  readModel,
  uiPorts,
  runtimePorts,
}: UseSearchSubmitOwnerOptions): SearchSubmitOwner => {
  const {
    query,
    preferredActiveTab,
    hasActiveTabPreference,
    isLoadingMore,
    openNow,
    priceLevels,
    risingActive,
  } = readModel;
  const {
    setActiveTab,
    setError,
    resetSheetToHidden,
    scrollResultsToTop,
    isSearchEditingRef,
    resetMapMoveFlag,
    loadRecentHistory,
    updateLocalRecentSearches,
    onPageOneResultsCommitted,
    onPresentationIntentStart,
    onPresentationIntentAbort,
  } = uiPorts;
  const {
    searchRuntimeBus,
    resultsPresentationSurfaceAuthority,
    lastSearchRequestIdRef,
    lastAutoOpenKeyRef,
    runSearch,
    mapRef,
    viewportBoundsService,
    userLocationRef,
    requestRuntimeOwner,
  } = runtimePorts;
  const { activeLoadingMoreTokenRef, isSearchRequestInFlightRef } = requestRuntimeOwner;
  const {
    beginResolverSubmitForegroundUi,
    prepareNaturalSearchEntry,
    resolveNaturalSearchAttemptConfig,
  } = useSearchSubmitEntryOwner({
    viewportBoundsService,
    query,
    preferredActiveTab,
    hasActiveTabPreference,
    isLoadingMore,
    openNow,
    priceLevels,
    risingActive,
    setActiveTab,
    setError,
    searchRuntimeBus,
    resetMapMoveFlag,
    activeLoadingMoreTokenRef,
    isSearchRequestInFlightRef,
    lastAutoOpenKeyRef,
    onPresentationIntentStart,
  });
  // S3-pre: commit-moment triggers (STA, chip reruns) adopt the SETTLED native camera
  // into the tuple BEFORE writing it — the resolver never touches the map ref.
  const captureFreshTupleBounds = React.useCallback(
    () => captureFreshCommittedBounds({ mapRef, viewportBoundsService }),
    [mapRef, viewportBoundsService]
  );

  // S3a: the WORLD RESOLVER + PRESENTATION SEAM. Chip-cause reruns resolve through this
  // (tuple in → seam commit out); the remaining trigger sources join per strangler
  // sub-stage (S3b initial submits, S3c launches + pagination). Composed here because
  // this hook already holds every seam dependency; the composition point (not the
  // resolver) dies with this file in S3d. Ref-indirected callbacks keep the resolver a
  // stable singleton across renders.
  const onPageOneResultsCommittedForWorldRef = React.useRef(onPageOneResultsCommitted);
  const runSearchForWorldRef = React.useRef(runSearch);
  // Post-present side effects (the response owner's post-commit UI sequence, reduced to
  // its surviving members): recent-history push for natural searches, single-restaurant
  // sheet collapse, scroll reset. Ref-indirected so the resolver stays a singleton.
  const worldPresentedEffectsRef = React.useRef<
    NonNullable<Parameters<typeof createSearchWorldResolver>[0]['onWorldPresented']>
  >(() => {});
  worldPresentedEffectsRef.current = ({ tuple, value, presentationIntentKind }) => {
    const identity = tuple.queryIdentity;
    // The response-adopted tab must reach the REACT tab state too (rows prepare off it);
    // the tuple writer already projected the bus key. Idempotent when nothing adopted.
    // The dual state dies in S4 when the reconciler owns presentation.
    setActiveTab(tuple.tab);
    if (identity.kind === 'natural') {
      updateLocalRecentSearches(identity.query);
      void loadRecentHistory();
    } else if (identity.kind === 'entity') {
      updateLocalRecentSearches({
        queryText: identity.displayName,
        selectedEntityId: identity.entityId,
        selectedEntityType: identity.entityType,
      });
      void loadRecentHistory();
    }
    const isInPlaceRerun =
      presentationIntentKind === 'search_this_area' || presentationIntentKind === 'variant_rerun';
    const collapsesToSingleRestaurant =
      value.singleRestaurantCandidate != null &&
      (identity.kind === 'natural' || identity.kind === 'entity');
    if (collapsesToSingleRestaurant) {
      // The response collapsed to one restaurant: hide the results sheet (the profile
      // auto-open runtime keys off lastSearchRequestIdRef, already truthful).
      resetSheetToHidden();
    } else if (!isInPlaceRerun && !isSearchEditingRef?.current) {
      scrollResultsToTop();
    }
  };
  React.useEffect(() => {
    onPageOneResultsCommittedForWorldRef.current = onPageOneResultsCommitted;
    runSearchForWorldRef.current = runSearch;
  });
  const worldResolver = React.useMemo(() => {
    const seam = createSearchWorldPresentationSeam({
      searchRuntimeBus,
      resultsPresentationSurfaceAuthority,
      onPageOneResultsCommitted: (payload) => {
        onPageOneResultsCommittedForWorldRef.current?.(payload);
      },
      // Strangler side state: profile auto-open + the natural append payload read this
      // ref; the resolver keeps it truthful at every commit until S4 deletes it.
      onWorldCommitted: ({ searchRequestId }) => {
        lastSearchRequestIdRef.current = searchRequestId;
      },
    });
    return createSearchWorldResolver({
      searchRuntimeBus,
      seam,
      fetchWorldForTuple: createSearchWorldFetcher({
        runSearch: (request) => runSearchForWorldRef.current(request),
        userLocationRef,
        shortcutCoverage: (params, options) => searchService.shortcutCoverage(params, options),
        // Chip reruns never move the camera, so the presented world's market is the
        // rerun's market; initial submits carry their own market resolution (S3b).
        getMarketKey: () =>
          getSearchMountedResultsDataSnapshot().results?.metadata?.marketKey ?? '',
        getFavoritesListResults: (listId, options) =>
          favoriteListsService.getListResults(listId, options),
      }),
      now: () => globalThis.performance?.now?.() ?? Date.now(),
      deriveWorldForTuple: createSearchWorldDerivation({ userLocationRef }),
      fetchNextPageForTuple: createSearchWorldNextPageFetcher({
        runSearch: (request) => runSearchForWorldRef.current(request),
        userLocationRef,
        shortcutCoverage: (params, options) => searchService.shortcutCoverage(params, options),
        getMarketKey: () =>
          getSearchMountedResultsDataSnapshot().results?.metadata?.marketKey ?? '',
        getFavoritesListResults: (listId, options) =>
          favoriteListsService.getListResults(listId, options),
      }),
      onWorldPresented: (args) => worldPresentedEffectsRef.current(args),
    });
  }, [searchRuntimeBus, resultsPresentationSurfaceAuthority, userLocationRef]);
  const resolveDesiredWorld = React.useCallback(
    (resolveArgs: SearchWorldResolveArgs) => worldResolver.resolve(resolveArgs),
    [worldResolver]
  );
  const { runRestaurantEntitySearch, submitViewportShortcut, launchFavoritesListResults } =
    useSearchStructuredSubmitOwner({
      searchRuntimeBus,
      viewportBoundsService,
      captureFreshTupleBounds,
      resolveDesiredWorld,
      beginResolverSubmitForegroundUi,
      onPresentationIntentAbort,
      resetMapMoveFlag,
    });
  const { submitSearch } = useSearchNaturalSubmitOwner({
    searchRuntimeBus,
    resolveDesiredWorld,
    beginResolverSubmitForegroundUi,
    prepareNaturalSearchEntry,
    resolveNaturalSearchAttemptConfig,
    onPresentationIntentAbort,
  });

  // Skip-LLM entity reveal: a natural-search submission whose context carries a
  // selected entity, which the BE routes through buildSelectedEntitySearchRequest
  // (no LLM cost). Mirrors the autocomplete entity-selection path in
  // handleSuggestionPress; the query is the span's display label.
  const launchEntitySearchResults = React.useCallback(
    async (params: {
      entityId: string;
      entityType: 'food' | 'food_attribute' | 'restaurant_attribute';
      submittedLabel: string;
    }): Promise<void> => {
      await submitSearch(
        {
          entrySurface: 'search_mode',
          submission: {
            source: 'autocomplete',
            context: {
              selectedEntityId: params.entityId,
              selectedEntityType: params.entityType,
              matchType: 'entity',
            },
          },
        },
        params.submittedLabel
      );
    },
    [submitSearch]
  );

  // S3c pagination cutover: EVERY load-more is resolver.resolveNextPage — guards read
  // the WORLD's pagination meta (the honest source), in-flight dedupe is per identity,
  // and a superseded append caches without presenting. The action owner's dispatcher
  // and the shortcut append chain are dead.
  const loadMoreResults = React.useCallback(
    (_searchMode: SearchMode) => {
      void worldResolver.resolveNextPage();
    },
    [worldResolver]
  );
  const { rerunActiveSearch } = useSearchSubmitActionOwner({
    submitSearch,
    submitViewportShortcut,
  });

  return {
    submitSearch,
    captureFreshTupleBounds,
    resolveDesiredWorld,
    worldResolverIsResolving: worldResolver.isResolving,
    runRestaurantEntitySearch,
    submitViewportShortcut,
    rerunActiveSearch,
    loadMoreResults,
    launchFavoritesListResults,
    launchEntitySearchResults,
  };
};

export default useSearchSubmitOwner;
