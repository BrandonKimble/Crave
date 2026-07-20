import React from 'react';
import { useSystemStatusStore } from '../../../store/systemStatusStore';
import {
  selectSearchMode,
  selectSubmittedQuery,
} from '../runtime/shared/search-desired-tuple-selectors';

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
} from './use-search-submit-entry-owner';
import { useSearchNaturalSubmitOwner } from './use-search-natural-submit-owner';
import { useSearchStructuredSubmitOwner } from './use-search-structured-submit-owner';
import { captureFreshCommittedBounds } from '../runtime/shared/search-fresh-bounds-capture';
import {
  createSearchWorldResolver,
  type SearchWorldResolveArgs,
} from '../runtime/resolver/search-world-resolver';
import { createSearchWorldPresentationSeam } from '../runtime/resolver/search-world-presentation-seam';
import { getSearchSurfaceRuntime } from '../runtime/surface/search-surface-runtime';
import {
  createSearchWorldFetcher,
  createSearchWorldNextPageFetcher,
} from '../runtime/resolver/search-world-fetch';
import { createSearchWorldDerivation } from '../runtime/resolver/search-world-derivation';
import { createSearchWorldReconciler } from '../runtime/reconciler/search-world-reconciler';
import { buildSearchCardsWorldKey } from '../runtime/shared/search-desired-state-contract';
import { getSearchReconcilerViewInputs } from '../runtime/reconciler/search-reconciler-presentation-port';
import { Keyboard } from 'react-native';
import { logger } from '../../../utils';
import { searchService } from '../../../services/search';
import { useSearchSubmitActionOwner } from './use-search-submit-action-owner';
type SearchSubmitOwnerReadModel = {
  query: string;
  submittedQuery: string;
  hasResults: boolean;
  canLoadMore: boolean;
  currentPage: number;
  activeTab: SegmentValue;
  currentResults: SearchResponse | null;
  isPaginationExhausted: boolean;
  preferredActiveTab: SegmentValue;
  hasActiveTabPreference: boolean;
  isLoadingMore: boolean;
  openNow: boolean;
  priceLevels: readonly number[];
  risingActive: boolean;
};

type SearchSubmitOwnerUiPorts = {
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
    operationToken: string;
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
    /** The EPISODE TOKEN `cardsKey#g{generation}` — the pending-arm/transaction id for
     *  this resolution episode (worldId end-to-end, fresh per episode; never bus-read). */
    operationToken: string;
    mode: SearchMode;
    preserveSheetState: boolean;
    transitionFromDockedPolls: boolean;
    targetTab: SegmentValue;
    submittedLabel?: string;
    entrySurface: SearchSubmitEntrySurface;
  }) => void;
  onPresentationIntentAbort?: () => void;
  /**
   * Wave-4 §3: a LIST world presented — fire the fitAll camera (every list pin inside
   * the safe region between the search bar and the mid-snap sheet top). Members are
   * the world's tab-side coordinates; the port owner holds the arbiter + snap points.
   */
  onListWorldPresented?: (args: {
    members: readonly { latitude: number; longitude: number }[];
  }) => void;
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
    /** SEE-LOCATIONS mode: the world = this restaurant's in-viewport
     *  locations as pins (the "See locations" chip's search). */
    seeLocations?: boolean;
  }) => Promise<void>;
  submitViewportShortcut: (
    targetTab: SegmentValue,
    submittedLabel: string,
    options: {
      searchThisArea?: boolean;
      forceFreshBounds?: boolean;
    }
  ) => Promise<void>;
  rerunActiveSearch: (params: {
    searchMode: SearchMode;
    activeTab: SegmentValue;
    submittedQuery: string;
    query: string;
    isSearchSessionActive: boolean;
  }) => Promise<void>;
  loadMoreResults: (searchMode: SearchMode) => void;
  launchEntitySearchResults: (params: {
    entityId: string;
    entityType: 'food' | 'food_attribute' | 'restaurant_attribute';
    submittedLabel: string;
  }) => Promise<void>;
  /** Wave-4 §3: the list-world half of the listWorld composite (favorites-as-search). */
  launchListSearchResults: (params: {
    listId: string;
    listType: import('../../../services/favorite-lists').FavoriteListType;
    displayTitle: string;
    targetUserId?: string | null;
    shareSlug?: string | null;
    slice?: {
      sort?: 'custom' | 'best' | 'recent';
      openNow?: boolean;
      priceLevels?: number[];
      marketKey?: string | null;
    };
  }) => Promise<void>;
};

const useSearchSubmitOwner = ({
  readModel,
  uiPorts,
  runtimePorts,
}: UseSearchSubmitOwnerOptions): SearchSubmitOwner => {
  const { query, isLoadingMore } = readModel;
  const {
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
    onListWorldPresented,
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
  } = runtimePorts;
  const { prepareNaturalSearchEntry, resolveNaturalSearchAttemptConfig } =
    useSearchSubmitEntryOwner({
      viewportBoundsService,
      query,
      isLoadingMore,
      setError,
      searchRuntimeBus,
      resetMapMoveFlag,
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
  const onPresentationIntentAbortRef = React.useRef(onPresentationIntentAbort);
  onPresentationIntentAbortRef.current = onPresentationIntentAbort;
  // S4b: the surviving full-enter foreground effects, driven from the reconciler's
  // DERIVED intent (the old beginResolverSubmitForegroundUi, trigger params replaced by
  // tuple facts + bus projections + view inputs).
  const enterForegroundEffectsRef = React.useRef<
    (args: {
      intent: {
        presentationIntentKind: 'search_this_area' | 'variant_rerun' | undefined;
        preserveSheetState: boolean;
        entrySurface: 'home' | 'search_mode' | 'results' | 'profile' | null;
      };
      tuple: import('../runtime/shared/search-desired-state-contract').SearchDesiredTuple;
      generation: number;
    }) => void
  >(() => {});
  enterForegroundEffectsRef.current = ({ intent, tuple, generation }) => {
    const busState = searchRuntimeBus.getState();
    const dockedPolls =
      !intent.preserveSheetState &&
      (getSearchReconcilerViewInputs()?.getDockedPollsFlag() ?? false);
    onPresentationIntentStart?.({
      kind: intent.presentationIntentKind ?? 'initial_search',
      operationToken: `${buildSearchCardsWorldKey(tuple)}#g${generation}`,
      mode: selectSearchMode(busState),
      preserveSheetState: intent.preserveSheetState,
      transitionFromDockedPolls: dockedPolls,
      targetTab: tuple.tab,
      submittedLabel: selectSubmittedQuery(busState) || undefined,
      entrySurface:
        intent.entrySurface === 'profile' || intent.entrySurface == null
          ? 'home'
          : intent.entrySurface,
    });
    lastAutoOpenKeyRef.current = null;
    // Presentation-path tab publish (S4c-1b): the enter presents its tab directly —
    // the tuple writer no longer projects activeTab for in-session tab deltas.
    searchRuntimeBus.publish({ activeTab: tuple.tab });
    setError(null);
    Keyboard.dismiss();
  };
  // Post-present side effects (the response owner's post-commit UI sequence, reduced to
  // its surviving members): recent-history push for natural searches, single-restaurant
  // sheet collapse, scroll reset. Ref-indirected so the resolver stays a singleton.
  const worldPresentedEffectsRef = React.useRef<
    NonNullable<Parameters<typeof createSearchWorldResolver>[0]['onWorldPresented']>
  >(() => {});
  worldPresentedEffectsRef.current = ({ tuple, value, presentationIntentKind }) => {
    const identity = tuple.queryIdentity;
    // The response-adopted tab is PRESENTED here (direct publish, never the tuple
    // writer) — idempotent when nothing adopted; the bus dedupes equal keys.
    searchRuntimeBus.publish({ activeTab: tuple.tab });
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
    // Wave-4 §3: a LIST world presented — fit ALL of the list's pins into the safe
    // region (the owner's decree: exact fit, no exceptions). Members come from the
    // world's tab side; finite-coordinate rows only.
    if (identity.kind === 'list') {
      const response = value.committedResponse;
      const members = (
        tuple.tab === 'dishes' ? (response.dishes ?? []) : (response.restaurants ?? [])
      )
        .map((row: { latitude?: number | null; longitude?: number | null }) => ({
          latitude: row.latitude,
          longitude: row.longitude,
        }))
        .filter(
          (m): m is { latitude: number; longitude: number } =>
            typeof m.latitude === 'number' &&
            Number.isFinite(m.latitude) &&
            typeof m.longitude === 'number' &&
            Number.isFinite(m.longitude)
        );
      if (__DEV__) {
        const rows =
          tuple.tab === 'dishes' ? (response.dishes ?? []) : (response.restaurants ?? []);
        // eslint-disable-next-line no-console
        console.log(
          `[FITALL] listWorldPresented rows=${rows.length} finiteMembers=${members.length} ` +
            `sampleKeys=${rows[0] ? Object.keys(rows[0]).slice(0, 14).join(',') : 'none'}`
        );
      }
      if (members.length > 0) {
        onListWorldPresented?.({ members });
      } else if (__DEV__) {
        // eslint-disable-next-line no-console
        console.error(
          '[FITALL] list world presented with ZERO finite-coordinate members — fit skipped'
        );
      }
    }
    // Scroll policy at the present moment (the settled design, same rule as the
    // include-similar flip): a VARIANT rerun is a NEW result set — it reveals at top.
    // Only search-this-area preserves the scroll (same filters, the user is driving the
    // map; the sheet is usually collapsed). This also re-asserts the scroll LEVEL at
    // every variant present, so no transient offset can survive a toggle cycle.
    const preservesScroll = presentationIntentKind === 'search_this_area';
    const collapsesToSingleRestaurant =
      value.singleRestaurantCandidate != null &&
      (identity.kind === 'natural' || identity.kind === 'entity');
    if (collapsesToSingleRestaurant) {
      // The response collapsed to one restaurant: hide the results sheet (the profile
      // auto-open runtime keys off lastSearchRequestIdRef, already truthful).
      resetSheetToHidden();
    } else if (!preservesScroll && !isSearchEditingRef?.current) {
      scrollResultsToTop();
    }
  };
  React.useEffect(() => {
    onPageOneResultsCommittedForWorldRef.current = onPageOneResultsCommitted;
    runSearchForWorldRef.current = runSearch;
  });
  const worldResolutionDriver = React.useMemo(() => {
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
      // Transition-perf fence: hold the world-commit fan-out while the results sheet is
      // mid-slide (redraw transaction live with sheet motion pending). sheetReady is a
      // motion-only fact (snap completion / motion-plane settle), so release never
      // depends on the held commit — no cycle.
      shouldHoldWorldCommitForSheetMotion: () => {
        const snapshot = getSearchSurfaceRuntime().getSnapshot();
        return snapshot.redrawTransaction != null && !snapshot.sheetMotionSettled;
      },
      subscribeWorldCommitRelease: (listener) => getSearchSurfaceRuntime().subscribe(listener),
    });
    const resolver = createSearchWorldResolver({
      searchRuntimeBus,
      seam,
      fetchWorldForTuple: createSearchWorldFetcher({
        runSearch: (request) => runSearchForWorldRef.current(request),
        userLocationRef,
        shortcutCoverage: (params, options) => searchService.shortcutCoverage(params, options),
        getFavoritesListResults: (listId, options) =>
          favoriteListsService.getListResults(listId, options),
      }),
      now: () => globalThis.performance?.now?.() ?? Date.now(),
      deriveWorldForTuple: createSearchWorldDerivation({ userLocationRef }),
      fetchNextPageForTuple: createSearchWorldNextPageFetcher({
        runSearch: (request) => runSearchForWorldRef.current(request),
        userLocationRef,
        shortcutCoverage: (params, options) => searchService.shortcutCoverage(params, options),
        getFavoritesListResults: (listId, options) =>
          favoriteListsService.getListResults(listId, options),
      }),
      onWorldPresented: (args) => worldPresentedEffectsRef.current(args),
    });
    // S4b: the reconciler is the ONE resolution driver — triggers only write the tuple.
    const reconciler = createSearchWorldReconciler({
      searchRuntimeBus,
      getPresentedCardsKey: () => {
        const worldId = seam.getPresentedWorldId();
        return worldId == null ? null : worldId.replace(/@v\d+$/, '');
      },
      resolve: (resolveArgs) =>
        resolver.resolve(resolveArgs as Parameters<typeof resolver.resolve>[0]),
      runEnterForegroundEffects: (effectArgs) => enterForegroundEffectsRef.current(effectArgs),
      onResolveFailed: (reason) => {
        // OFFLINE = a paused resolution (owner call): the loading level persists and
        // the reconnect auto-retry resumes it — so the presentation intent must NOT
        // abort (the abort is what clears the covers). No error toast either; the
        // system banner owns the offline story.
        if (useSystemStatusStore.getState().isOffline) {
          logger.info('Search resolution paused offline', { message: reason });
          return;
        }
        // A resolution canceled by a session exit (the close aborts the in-flight fetch)
        // is expected lifecycle, not a failure — logging it as an error raised a dev
        // LogBox toast on every dismiss-with-pending-fetch. Real failures stay loud.
        const isCanceledByExit =
          typeof reason === 'string' &&
          (reason.includes('canceled') || reason.includes('runSearch returned no response'));
        if (isCanceledByExit) {
          logger.info('Search resolution superseded/canceled', { message: reason });
        } else {
          logger.error('Search resolution failed', { message: reason });
        }
        onPresentationIntentAbortRef.current?.();
      },
    });
    return { resolver, reconciler, seam };
  }, [searchRuntimeBus, resultsPresentationSurfaceAuthority, userLocationRef]);
  const worldResolver = worldResolutionDriver.resolver;
  // The reconciler's bus subscription lives in the effect lifecycle, not the memo —
  // a memo-time start() has no teardown, so every Fast Refresh (which re-runs memos)
  // stacked another live resolution driver (N resolve kicks per tuple write).
  React.useEffect(() => {
    const stopReconciler = worldResolutionDriver.reconciler.start();
    return () => {
      stopReconciler();
      // Same leak class as the reconciler note above: a recreated seam must not keep
      // its world-commit-hold subscription firing on the singleton surface runtime.
      worldResolutionDriver.seam.disposeWorldCommitHold();
    };
  }, [worldResolutionDriver]);
  const resolveDesiredWorld = React.useCallback(
    (resolveArgs: SearchWorldResolveArgs) => worldResolver.resolve(resolveArgs),
    [worldResolver]
  );
  const { runRestaurantEntitySearch, submitViewportShortcut, launchListSearchResults } =
    useSearchStructuredSubmitOwner({
      searchRuntimeBus,
      viewportBoundsService,
      captureFreshTupleBounds,
      resetMapMoveFlag,
    });
  const { submitSearch } = useSearchNaturalSubmitOwner({
    prepareNaturalSearchEntry,
    resolveNaturalSearchAttemptConfig,
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
          selectedEntity: { entityId: params.entityId, entityType: params.entityType },
          submission: { source: 'autocomplete' },
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
    launchEntitySearchResults,
    launchListSearchResults,
  };
};

export default useSearchSubmitOwner;
