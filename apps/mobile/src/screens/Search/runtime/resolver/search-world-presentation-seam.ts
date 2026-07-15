// The PRESENTATION SEAM (charter §3, S3 edit map §2): the ONE place a resolved world
// becomes mounted state. The commit body replicates the response-owner's atomic batch
// order exactly — (1) mounted-results snapshot, (2) per-tab coverage, (3) surface
// authority, (4) root-bus results patch, (5) operation/lane/loading publishes — then
// fires onPageOneResultsCommitted OUTSIDE the batch (the unchanged adapter into the
// surface-transaction machine, which stays the sole presentation writer).
//
// Token contract (S4c-1c-2): the operation token ('world:'+generation) threads
// EXPLICITLY — beginResolution hands it to onResolutionStart, the page-one payload
// carries it to the response-time stages. Nothing reads it back off the bus.
//
// RED contract: a second commitWorldToMountedState for the same worldId is a violation —
// one structural frame per world, provable in the log.

import type { SearchResponse } from '../../../../types';
import type { SearchQueryIdentity } from '../shared/search-desired-state-contract';
import { useSystemStatusStore } from '../../../../store/systemStatusStore';
import { logger } from '../../../../utils';
import { reportSearchFlowContractViolation } from '../shared/search-flow-contracts';
import type { SearchRuntimeBus, SearchRuntimeBusState } from '../shared/search-runtime-bus';
import type { ResultsPresentationSurfaceAuthority } from '../shared/results-presentation-surface-authority';
import {
  commitSearchMountedResultsCoverage,
  getSearchMountedResultsDataSnapshot,
  publishSearchMountedResultsDataSnapshot,
  type SearchMountedResultsCoverageEntry,
  type SearchMountedResultsMarkerProjectionByTab,
} from '../shared/search-mounted-results-data-store';
import type { SearchSubmitInPlaceRerunIntentKind } from '../../hooks/use-search-submit-entry-owner';

/** The root-bus results patch a committed world carries (precomputed by the world-value
 *  constructor; the seam publishes it verbatim — identity keys preserved or narrowed by
 *  the constructor, never re-derived here). */
export type SearchWorldRootBusResultsPatch = Pick<
  SearchRuntimeBusState,
  'resultsIdentityCandidateKey' | 'resultsDishCount' | 'resultsRestaurantCount'
> &
  Partial<Pick<SearchRuntimeBusState, 'resultsRequestKey' | 'resultsPage'>>;

export type SearchWorldPaginationMeta = {
  page: number;
  hasMoreFood: boolean;
  hasMoreRestaurants: boolean;
  isPaginationExhausted: boolean;
  canLoadMore: boolean;
  totalRestaurantResults: number;
  totalFoodResults: number;
};

/** The cards-world VALUE (cache entry payload): everything the seam needs to present the
 *  world without consulting any owner. Coverage rides per tab (coverageWorld ⊆ value). */
export type SearchWorldValue = {
  committedResponse: SearchResponse;
  /** The world's structured identity (presenter dissolution): the SAME vocabulary as
   *  entry.desire — world-backed consumers match on THIS, never by parsing key strings
   *  (the favorites:<id>:<ts> prefix-parse class, dead). */
  queryIdentity: SearchQueryIdentity;
  markerProjectionByTab: SearchMountedResultsMarkerProjectionByTab;
  resultsIdentityKey: string | null;
  searchRequestId: string;
  rootBusResultsPatch: SearchWorldRootBusResultsPatch;
  paginationMeta: SearchWorldPaginationMeta;
  coverageByTab: Partial<
    Record<'restaurants' | 'dishes', SearchMountedResultsCoverageEntry | null>
  >;
  /** Natural identities: the response's single-restaurant collapse candidate (world
   *  metadata — presentation effects read it post-commit, never re-derive from UI). */
  singleRestaurantCandidate?: unknown;
};

export type SearchWorldCommitArgs = {
  worldId: string;
  generation: number;
  value: SearchWorldValue;
  activeTab: 'restaurants' | 'dishes';
  dataReadyFrom: 'cache' | 'network' | 'in_flight';
  searchInputKey: string | null;
  /** The bounds this world resolved against (tuple.committedBounds) — the page-one
   *  adapter's camera input. */
  requestBounds: import('../../../../types').MapBounds | null;
  presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
  replaceResultsInPlace?: boolean;
  /** Version bump under the SAME identity (pagination append): steps 1/3/4/5 only — no
   *  page-one choreography, no coverage refetch. */
  isVersionUpdateOfPresentedWorld?: boolean;
};

export type SearchWorldPresentationSeamEnv = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  onPageOneResultsCommitted: (payload: {
    searchRequestId: string;
    /** The EPISODE TOKEN `cardsKey#g{generation}` (S4c-1c-3): worldId end-to-end, fresh
     *  per episode — the arm side derives the identical token from the tuple, so the
     *  response-time stage keys to the SAME id the pending arm used (never bus-read). */
    operationToken: string;
    requestBounds: import('../../../../types').MapBounds | null;
    resultsIdentityKey: string | null;
    resultsDataKey: string | null;
    dataReadyFrom: 'cache' | 'network' | 'in_flight';
    searchInputKey: string | null;
    replaceResultsInPlace: boolean;
    presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
  }) => void;
  /** Surviving foreground effects from prepareSearchRequestForegroundUi (presentation
   *  intent start, keyboard dismiss, error clear) — invoked by beginResolution. */
  onResolutionStart?: (args: {
    generation: number;
    presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
  }) => void;
  /** Fires on every world commit (including represent-noops) — the strangler home for
   *  lastSearchRequestIdRef and other commit-keyed side state until S4. */
  onWorldCommitted?: (args: { searchRequestId: string; worldId: string }) => void;
  /** Transition-perf fence: while the results sheet is mid-slide (an enter snap
   *  commanded, not yet settled), the ~150ms world-commit fan-out + row mounts must not
   *  land — they starve the 360ms slide down to a couple of frames. When this returns
   *  true the commit is HELD (latest-wins) and flushed via the settle subscription.
   *  Motion-only predicate: settle never depends on the commit, so no cycle. */
  shouldHoldWorldCommitForSheetMotion?: () => boolean;
  /** Subscribe to the signal that may release a held commit (sheet settled / redraw
   *  transaction changed). Returns an unsubscribe. Required if the predicate is set. */
  subscribeWorldCommitRelease?: (listener: () => void) => () => void;
};

export type SearchWorldPresentationSeam = {
  /** The worldId last committed to the screen (S4a reconciler classification input). */
  getPresentedWorldId: () => string | null;
  /** SYNCHRONOUS: publishes presentingPhase 'resolving' + isSearchLoading, then runs
   *  onResolutionStart (which arms pending presentations with the explicit token). */
  beginResolution: (args: {
    generation: number;
    presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
  }) => void;
  commitWorldToMountedState: (args: SearchWorldCommitArgs) => void;
  failResolution: (args: { generation: number; reason: string }) => void;
  /** Teardown for the world-commit hold: drops any held commit and unsubscribes the
   *  release listener (a recreated/unmounted seam must not keep firing on the
   *  singleton surface runtime — the reconciler leak class). */
  disposeWorldCommitHold: () => void;
};

export const createSearchWorldPresentationSeam = (
  env: SearchWorldPresentationSeamEnv
): SearchWorldPresentationSeam => {
  // RED-contract state: one structural frame per world PER PRESENTATION EPISODE. A
  // re-commit of the world that is ALREADY ON SCREEN is a violation (double frame); a
  // cached world returning after something else presented (A→B→A) is the cache working.
  // Grounded in the COMPOSITE (the mounted snapshot's identity), not seam-local memory —
  // the legacy submit path also presents until S3d, and only the mounted store sees both.
  let presentedWorldId: string | null = null;
  // Transition-perf fence state: at most ONE held commit (latest wins — a newer commit
  // for a newer desire supersedes a held stale one by construction), released by the
  // sheet-settle subscription. See env.shouldHoldWorldCommitForSheetMotion. NOTE: the
  // reveal statechart (search-reveal-statechart.ts) is chartered to own this ordering
  // (arm-under-cover / joint sequencing); this seam-level hold is the enforcement point
  // until that statechart is wired into production — fold it in there, don't grow it.
  let heldCommitArgs: SearchWorldCommitArgs | null = null;
  let releaseUnsubscribe: (() => void) | null = null;
  const flushHeldCommitIfReleased = (): void => {
    if (heldCommitArgs == null || env.shouldHoldWorldCommitForSheetMotion?.() === true) {
      return;
    }
    releaseUnsubscribe?.();
    releaseUnsubscribe = null;
    const args = heldCommitArgs;
    heldCommitArgs = null;
    commitWorldToMountedStateNow(args);
  };
  const commitWorldToMountedState = (args: SearchWorldCommitArgs): void => {
    if (env.shouldHoldWorldCommitForSheetMotion?.() === true) {
      // Loud contract: dropping a held commit is only legal when the newcomer strictly
      // supersedes it (newer generation, or the same world re-resolved). Any other
      // overwrite is a lost world — report it, never lose it silently.
      if (heldCommitArgs != null) {
        const supersedes =
          args.generation > heldCommitArgs.generation || args.worldId === heldCommitArgs.worldId;
        if (!supersedes) {
          reportSearchFlowContractViolation('held_world_commit_dropped_without_supersession', {
            droppedWorldId: heldCommitArgs.worldId,
            droppedGeneration: heldCommitArgs.generation,
            incomingWorldId: args.worldId,
            incomingGeneration: args.generation,
          });
        } else if (__DEV__) {
          logger.info('[WORLD-COMMIT] held commit superseded', {
            droppedWorldId: heldCommitArgs.worldId,
            incomingWorldId: args.worldId,
          });
        }
      }
      heldCommitArgs = args;
      if (releaseUnsubscribe == null && env.subscribeWorldCommitRelease != null) {
        releaseUnsubscribe = env.subscribeWorldCommitRelease(flushHeldCommitIfReleased);
      }
      if (__DEV__) {
        logger.info('[WORLD-COMMIT] held for sheet motion', { worldId: args.worldId });
      }
      return;
    }
    commitWorldToMountedStateNow(args);
  };
  const disposeWorldCommitHold = (): void => {
    releaseUnsubscribe?.();
    releaseUnsubscribe = null;
    heldCommitArgs = null;
  };
  return {
    getPresentedWorldId: () => presentedWorldId,
    disposeWorldCommitHold,
    beginResolution: ({ generation, presentationIntentKind }) => {
      env.searchRuntimeBus.publish({
        presentingPhase: 'resolving',
        isSearchLoading: true,
        isLoadingMore: false,
        // A new attempt clears the failure level — the retry surfaces drop the moment
        // the retry (or any newer desire) starts resolving.
        searchResolutionFailure: null,
      });
      env.onResolutionStart?.({ generation, presentationIntentKind });
    },
    commitWorldToMountedState,
    failResolution,
  };

  function commitWorldToMountedStateNow(args: SearchWorldCommitArgs): void {
    {
      const {
        worldId,
        generation,
        value,
        activeTab,
        dataReadyFrom,
        searchInputKey,
        presentationIntentKind,
        replaceResultsInPlace,
        isVersionUpdateOfPresentedWorld,
      } = args;
      const mountedIdentityKey = getSearchMountedResultsDataSnapshot().resultsIdentityKey;
      const worldIsOnScreen =
        worldId === presentedWorldId &&
        value.resultsIdentityKey != null &&
        mountedIdentityKey === value.resultsIdentityKey;
      if (worldIsOnScreen && !isVersionUpdateOfPresentedWorld) {
        // REPRESENT-NOOP: the world is already the mounted composite (a re-assert of the
        // same desire — re-submit, coalesced double-tap). "One structural frame per
        // world" is enforced BY CONSTRUCTION here: skip the structural batch entirely,
        // but complete the operation (id/lane/loading) and the page-one choreography so
        // an armed presentation intent settles instead of hanging on a commit that never
        // comes. Provable in the trace via represent_noop.
        env.searchRuntimeBus.publish({
          presentedWorldId: worldId,
          presentingPhase: 'presented',
          isSearchLoading: false,
          isLoadingMore: false,
        });
        if (value.paginationMeta.page === 1) {
          env.onPageOneResultsCommitted({
            searchRequestId: value.searchRequestId,
            operationToken: `${worldId.replace(/@v\d+$/, '')}#g${generation}`,
            requestBounds: args.requestBounds,
            resultsIdentityKey: value.resultsIdentityKey,
            resultsDataKey: value.resultsIdentityKey,
            dataReadyFrom,
            searchInputKey,
            replaceResultsInPlace: Boolean(replaceResultsInPlace),
            presentationIntentKind,
          });
        }
        env.onWorldCommitted?.({ searchRequestId: value.searchRequestId, worldId });
        if (__DEV__) {
          logger.info('[WORLD-COMMIT] represent_noop', { generation, worldId });
        }
        return;
      }
      presentedWorldId = worldId;
      env.searchRuntimeBus.batch(() => {
        // (contract carried from the response owner) a page-1 response with zero rows on
        // both tabs but nonzero totals is internally inconsistent — loud, not fatal.
        const rowCount =
          (value.committedResponse.restaurants?.length ?? 0) +
          (value.committedResponse.dishes?.length ?? 0);
        const totals =
          (value.committedResponse.metadata?.totalRestaurantResults ?? 0) +
          (value.committedResponse.metadata?.totalFoodResults ?? 0);
        if (rowCount === 0 && totals > 0) {
          reportSearchFlowContractViolation('empty_page_with_nonzero_totals', {
            resultsIdentityKey: value.resultsIdentityKey,
            totals,
            dataReadyFrom,
            targetTab: activeTab,
          });
        }
        publishSearchMountedResultsDataSnapshot(value.committedResponse, {
          activeTab,
          markerProjectionByTab: value.markerProjectionByTab,
          resultsIdentityKey: value.resultsIdentityKey,
          resultsQueryIdentity: value.queryIdentity,
        });
        if (!isVersionUpdateOfPresentedWorld) {
          for (const tab of ['restaurants', 'dishes'] as const) {
            const entry = value.coverageByTab[tab];
            if (entry != null) {
              commitSearchMountedResultsCoverage({
                searchRequestId: value.searchRequestId,
                tab,
                entry,
              });
            }
          }
        }
        env.resultsPresentationSurfaceAuthority.publish(
          {
            resultsRequestKey: value.rootBusResultsPatch.resultsRequestKey ?? null,
            resultsIdentityKey: value.resultsIdentityKey,
            resultsPreparedRowsKey: null,
            listPreparedRowsReady: false,
            isResultsHydrationSettled: value.resultsIdentityKey == null,
          },
          'world_commit'
        );
        env.searchRuntimeBus.publish({
          ...value.rootBusResultsPatch,
          presentedWorldId: worldId,
          presentingPhase: 'presented',
          // Level honesty: a freshly presented world has no pending failure.
          searchResolutionFailure: null,
          isSearchLoading: false,
          isLoadingMore: false,
          currentPage: value.paginationMeta.page,
          hasMoreFood: value.paginationMeta.hasMoreFood,
          hasMoreRestaurants: value.paginationMeta.hasMoreRestaurants,
          isPaginationExhausted: value.paginationMeta.isPaginationExhausted,
          canLoadMore: value.paginationMeta.canLoadMore,
        });
      });
      if (!isVersionUpdateOfPresentedWorld && value.paginationMeta.page === 1) {
        env.onPageOneResultsCommitted({
          searchRequestId: value.searchRequestId,
          operationToken: `${worldId.replace(/@v\d+$/, '')}#g${generation}`,
          requestBounds: args.requestBounds,
          resultsIdentityKey: value.resultsIdentityKey,
          resultsDataKey: value.resultsIdentityKey,
          dataReadyFrom,
          searchInputKey,
          replaceResultsInPlace: Boolean(replaceResultsInPlace),
          presentationIntentKind,
        });
      }
      env.onWorldCommitted?.({ searchRequestId: value.searchRequestId, worldId });
      if (__DEV__) {
        logger.info('[WORLD-COMMIT]', {
          generation,
          worldId,
          dataReadyFrom,
          activeTab,
          dishCount: value.committedResponse.dishes?.length ?? 0,
          restaurantCount: value.committedResponse.restaurants?.length ?? 0,
          isVersionUpdate: Boolean(isVersionUpdateOfPresentedWorld),
        });
      }
    }
  }

  function failResolution({ generation, reason }: { generation: number; reason: string }): void {
    const offline = useSystemStatusStore.getState().isOffline;
    if (offline) {
      // OFFLINE = a PAUSED resolution, not a failure (owner call, 2026-07-08): the
      // loading level simply persists — universal across every transition, no
      // per-surface offline styling — the system banner explains, and the reconnect
      // auto-retry resumes the pending desire (the hang is FINITE, unlike Airbnb's).
      // Only the failure fact is recorded, for the reconnect edge to consume.
      env.searchRuntimeBus.publish({
        searchResolutionFailure: { generation, reason, offline: true, atMs: Date.now() },
      });
      if (__DEV__) {
        logger.info('[WORLD-COMMIT] resolution paused offline', { generation, reason });
      }
      return;
    }
    env.searchRuntimeBus.publish({
      // A failed resolution settles back onto whatever is on screen — 'idle' only
      // when nothing is presented (a failed session enter).
      presentingPhase: presentedWorldId != null ? 'presented' : 'idle',
      isSearchLoading: false,
      isLoadingMore: false,
      // The FAILURE LEVEL: desired stays (the charter's rule), presentation shows
      // the failed fact. The presented world (if any) is never destroyed.
      searchResolutionFailure: { generation, reason, offline: false, atMs: Date.now() },
    });
    if (__DEV__) {
      logger.warn('[WORLD-COMMIT] resolution failed', { generation, reason });
    }
  }
};
