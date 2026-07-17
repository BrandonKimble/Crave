// The WORLD RESOLVER (charter §3, S3 edit map §2): desired tuple in → presented world
// out. One resolution ladder for every trigger source — cache → derivation → network —
// with generation semantics owned by the pure resolver core (superseded resolutions
// complete into cache, never present; presentation is decided by CURRENT desire).
//
// S3 strangler shape: the resolver is instantiated dark in S3-pre; S3a routes chip-cause
// reruns through resolve(), S3b the initial submits, S3c launches + pagination, S3d
// deletes the legacy owner chain. The identity→fetch table (edit map §2) fills in per
// sub-stage via the env — the resolver itself never touches the map ref, never reads
// filters from anywhere but the tuple, and never presents except through the seam.

import { logger } from '../../../../utils';
import type { SearchRuntimeBus } from '../shared/search-runtime-bus';
import {
  buildSearchCoverageWorldKey,
  buildSearchWorldSliceKey,
  searchWorldGroupOfSliceKey,
  areSearchDesiredTuplesEqual,
  type SearchDesiredTuple,
  type SearchTupleWriteCause,
} from '../shared/search-desired-state-contract';
import { writeSearchDesiredTuple } from '../shared/search-desired-state-writer';
import {
  createSearchWorldCache,
  type SearchWorldCache,
  type SearchWorldEntry,
} from '../shared/search-world-cache';
import { createResolverCore, type ResolverCore } from '../shared/search-world-resolver-core';
import type {
  SearchWorldPresentationSeam,
  SearchWorldValue,
} from './search-world-presentation-seam';
import type { SearchSubmitInPlaceRerunIntentKind } from '../../hooks/use-search-submit-entry-owner';

const WORLD_CACHE_MAX_UNPINNED = 8;
const WORLD_CACHE_STALE_AFTER_MS = 5 * 60 * 1000;
/** openNow variants age out fast — "open now" is a wall-clock claim. */
export const OPEN_NOW_WORLD_STALE_AFTER_MS = 60 * 1000;

export type SearchWorldNetworkFetchResult = {
  value: SearchWorldValue;
  /** Natural identities: the response-derived tab this world should present under.
   *  The resolver adopts it via ONE tuple write (cause 'response_tab_adopt'). */
  adoptedTab?: 'restaurants' | 'dishes';
  /** Where the data actually came from (the request layer may have its own cache). */
  dataReadyFrom: 'cache' | 'network' | 'in_flight';
  searchInputKey: string | null;
  /** A derived world that approximates the network truth (e.g. the client-filtered
   *  open-now variant): the resolver presents it INSTANTLY and then trues it up from
   *  the network in the background, committing the fetched value as a VERSION UPDATE
   *  of the presented world (no second reveal choreography). */
  provisional?: boolean;
};

export type SearchWorldResolverEnv = {
  searchRuntimeBus: SearchRuntimeBus;
  seam: SearchWorldPresentationSeam;
  /** The identity→fetch table (edit map §2). Resolves the FULL world value for a tuple —
   *  cards + coverage fetched in parallel inside, payload built from the tuple only.
   *  Filled in per strangler sub-stage; identities not yet routed throw loudly. */
  fetchWorldForTuple: (args: {
    tuple: SearchDesiredTuple;
    generation: number;
    cause: SearchTupleWriteCause | null;
    requestDecoration?: SearchWorldResolveArgs['requestDecoration'];
  }) => Promise<SearchWorldNetworkFetchResult>;
  /** Derivation tier (optional per sub-stage): serve the requested tuple by recomposing
   *  an already-resolved world (tab-only change; page-1 includeSimilar swap). Returns
   *  null when no derivation applies and the ladder falls through to network. */
  deriveWorldForTuple?: (args: {
    tuple: SearchDesiredTuple;
    sliceKey: string;
    cache: SearchWorldCache<SearchWorldValue>;
  }) => SearchWorldNetworkFetchResult | null;
  now: () => number;
  /** S4a parity: report every resolve kick (generation + passed intent kind) so the
   *  dark reconciler can diff its derivation. Deleted in S4b. */
  onResolveKick?: (args: {
    generation: number;
    presentationIntentKind: 'search_this_area' | 'variant_rerun' | undefined;
  }) => void;
  /** Page-N fetch (S3 pagination cutover) — payload from the world's identity inputs. */
  fetchNextPageForTuple?: (args: {
    tuple: SearchDesiredTuple;
    baseValue: SearchWorldValue;
    targetPage: number;
  }) => Promise<SearchWorldNetworkFetchResult>;
  /** Post-present side effects keyed to the DESIRE (history push, single-restaurant
   *  sheet collapse) — strangler home until S4's reconciler owns them. */
  onWorldPresented?: (args: {
    tuple: SearchDesiredTuple;
    value: SearchWorldValue;
    dataReadyFrom: 'cache' | 'network' | 'in_flight';
    presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
  }) => void;
};

export type SearchWorldResolveArgs = {
  tuple: SearchDesiredTuple;
  generation: number;
  cause: SearchTupleWriteCause | null;
  presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
  /** Request DECORATION: analytics metadata (submissionSource, typedPrefix context)
   *  that rides the network request but never the cache key — a cache hit means no
   *  request, so no decoration is owed. */
  requestDecoration?: {
    submissionSource?: string;
    submissionContext?: Record<string, unknown>;
  };
  /** Invoked SYNCHRONOUSLY after seam.beginResolution (the operation token published) and
   *  BEFORE any tier can commit — the slot where a pending presentation arm reads the
   *  operation id (the transaction-id ordering named in the edit map). */
  onResolutionBegan?: () => void;
  /** Invoked when the resolution fails terminally — the trigger disarms its pending
   *  presentation so a failed rerun can't leave the cover armed until the watchdog. */
  onResolutionFailed?: (reason: string) => void;
};

export type SearchWorldResolver = {
  /** Imperative kick (S3a): the trigger's reader hands the freshly-written tuple over. */
  resolve: (args: SearchWorldResolveArgs) => Promise<void>;
  /** Append the next page into the CURRENT desired world (version bump, no page-one
   *  choreography). Guards read the WORLD's pagination meta — the honest source. */
  resolveNextPage: () => Promise<void>;
  isResolving: () => boolean;
  cache: SearchWorldCache<SearchWorldValue>;
  core: ResolverCore;
};

export const createSearchWorldResolver = (env: SearchWorldResolverEnv): SearchWorldResolver => {
  // S2 (lens exit §2/§4b): the cache keys RESOLVED SLICES — `worldKey##lensKey`. The
  // flat table IS the design's per-world slice table (lookup-equivalent); pins and
  // eviction group by the worldKey half so a pinned world keeps all its lens slices.
  const cache = createSearchWorldCache<SearchWorldValue>({
    maxUnpinnedWorlds: WORLD_CACHE_MAX_UNPINNED,
    staleAfterMs: WORLD_CACHE_STALE_AFTER_MS,
    groupOf: searchWorldGroupOfSliceKey,
  });
  const core = createResolverCore();

  const isEntryFresh = (entry: SearchWorldEntry<SearchWorldValue>, openNow: boolean): boolean => {
    const ageMs = env.now() - entry.resolvedAt;
    return openNow ? ageMs <= OPEN_NOW_WORLD_STALE_AFTER_MS : !cache.isEntryStale(entry, env.now());
  };

  const isTupleStillDesired = (tuple: SearchDesiredTuple): boolean =>
    areSearchDesiredTuplesEqual(env.searchRuntimeBus.getState().desiredTuple, tuple);

  const presentEntry = (args: {
    entry: SearchWorldEntry<SearchWorldValue>;
    tuple: SearchDesiredTuple;
    generation: number;
    dataReadyFrom: 'cache' | 'network' | 'in_flight';
    searchInputKey: string | null;
    presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
  }): void => {
    env.seam.commitWorldToMountedState({
      worldId: args.entry.worldId,
      generation: args.generation,
      value: args.entry.value,
      activeTab: args.tuple.tab,
      dataReadyFrom: args.dataReadyFrom,
      searchInputKey: args.searchInputKey,
      requestBounds: args.tuple.committedBounds?.bounds ?? null,
      presentationIntentKind: args.presentationIntentKind,
    });
    env.onWorldPresented?.({
      tuple: args.tuple,
      value: args.entry.value,
      dataReadyFrom: args.dataReadyFrom,
      presentationIntentKind: args.presentationIntentKind,
    });
  };

  const resolve = async (args: SearchWorldResolveArgs): Promise<void> => {
    const { tuple, generation, cause, presentationIntentKind, onResolutionBegan } = args;
    const sliceKey = buildSearchWorldSliceKey(tuple);
    const coverageKey = buildSearchCoverageWorldKey(tuple);
    core.observeGeneration(generation);
    env.onResolveKick?.({ generation, presentationIntentKind });
    env.seam.beginResolution({ generation, presentationIntentKind });
    onResolutionBegan?.();

    // Tier 1 — cache.
    const cached = cache.get(sliceKey);
    if (cached != null && isEntryFresh(cached, tuple.filterVariant.openNow)) {
      if (__DEV__) {
        logger.info('[RESOLVE]', { generation, cause, sliceKey, coverageKey, tier: 'cache' });
      }
      // UNIFORM ASYNC COMMIT (perf attribution 2026-07-12): a synchronous cache-tier
      // present landed the entire world-commit composite (~200-450ms of store fan-out,
      // row prep and frame build) in the SAME JS task as the press-up publish — the
      // measured 656ms mega-stall that froze the sheet slide's first frames on every
      // cached resubmit. Network commits always arrive in a later task; the cache tier
      // now matches that contract with one macrotask hop, so press-up paints first.
      // beginResolution/foreground effects stayed synchronous above — the press-up
      // choreography (skeleton, covers, intents) is untouched.
      await new Promise<void>((resolveYield) => setTimeout(resolveYield, 0));
      if (!isTupleStillDesired(tuple)) {
        return;
      }
      presentEntry({
        entry: cached,
        tuple,
        generation,
        dataReadyFrom: 'cache',
        searchInputKey: null,
        presentationIntentKind,
      });
      return;
    }

    // Tier 2 — derivation (recompose from a resolved sibling world; zero network).
    const derived = env.deriveWorldForTuple?.({ tuple, sliceKey, cache });
    if (derived != null) {
      const entry = cache.commit({
        worldKey: sliceKey,
        status: { kind: 'ready' },
        value: derived.value,
        resolvedAt: env.now(),
      });
      if (__DEV__) {
        logger.info('[RESOLVE]', {
          generation,
          cause,
          sliceKey,
          coverageKey,
          tier: derived.provisional ? 'derivation_provisional' : 'derivation',
        });
      }
      // Same uniform-async contract as the cache tier above.
      await new Promise<void>((resolveYield) => setTimeout(resolveYield, 0));
      if (!isTupleStillDesired(tuple)) {
        return;
      }
      presentEntry({
        entry,
        tuple,
        generation,
        dataReadyFrom: derived.dataReadyFrom,
        searchInputKey: derived.searchInputKey,
        presentationIntentKind,
      });
      if (derived.provisional && env.fetchWorldForTuple != null) {
        // Background TRUE-UP: fetch the network truth for the same world and commit it
        // as a VERSION UPDATE of the presented world — rows/coverage/totals correct
        // themselves in place, no second reveal choreography. Superseded landings still
        // cache (the world is right when the user returns to it).
        void (async () => {
          try {
            const fetched = await env.fetchWorldForTuple({ tuple, generation, cause });
            const trueEntry = cache.commit({
              worldKey: sliceKey,
              status: { kind: 'ready' },
              value: fetched.value,
              resolvedAt: env.now(),
            });
            if (__DEV__) {
              logger.info('[RESOLVE] provisional true-up landed', { sliceKey });
            }
            if (isTupleStillDesired(tuple)) {
              env.seam.commitWorldToMountedState({
                worldId: trueEntry.worldId,
                generation,
                value: trueEntry.value,
                activeTab: tuple.tab,
                dataReadyFrom: fetched.dataReadyFrom,
                searchInputKey: fetched.searchInputKey,
                requestBounds: tuple.committedBounds?.bounds ?? null,
                isVersionUpdateOfPresentedWorld: true,
              });
            }
          } catch (error) {
            logger.warn('[RESOLVE] provisional true-up failed', {
              message: error instanceof Error ? error.message : 'unknown error',
            });
          }
        })();
      }
      return;
    }

    // Tier 3 — network. In-flight dedupe by key; superseded landings commit into cache
    // without presenting (A→B→A retoggle finds both cached).
    const startedFetch = core.begin({ generation, worldKey: sliceKey });
    if (!startedFetch) {
      if (__DEV__) {
        logger.info('[RESOLVE]', {
          generation,
          cause,
          sliceKey,
          coverageKey,
          tier: 'network',
          dedupedInFlight: true,
        });
      }
      return;
    }
    if (__DEV__) {
      logger.info('[RESOLVE]', { generation, cause, sliceKey, coverageKey, tier: 'network' });
    }
    try {
      const fetched = await env.fetchWorldForTuple({
        tuple,
        generation,
        cause,
        requestDecoration: args.requestDecoration,
      });
      const entry = cache.commit({
        worldKey: sliceKey,
        status: { kind: 'ready' },
        value: fetched.value,
        resolvedAt: env.now(),
      });
      const disposition = core.land({ generation, worldKey: sliceKey }, () =>
        isTupleStillDesired(tuple)
      );
      if (disposition === 'present') {
        // Natural tab adopt: the response decides the tab; even the resolver's own
        // adopt is a TUPLE WRITE (one writer), then the world presents under it.
        let presentTuple = tuple;
        if (fetched.adoptedTab != null && fetched.adoptedTab !== tuple.tab) {
          const adopted = writeSearchDesiredTuple(
            env.searchRuntimeBus,
            { tab: fetched.adoptedTab },
            'response_tab_adopt'
          );
          core.observeGeneration(adopted.generation);
          presentTuple = adopted.tuple;
        }
        presentEntry({
          entry,
          tuple: presentTuple,
          generation,
          dataReadyFrom: fetched.dataReadyFrom,
          searchInputKey: fetched.searchInputKey,
          presentationIntentKind,
        });
      } else if (__DEV__) {
        // The superseded-completion trace — proves A→B→A lands from cache.
        logger.info('[RESOLVE] superseded landing cached', { generation, sliceKey });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      core.fail({ generation, worldKey: sliceKey });
      // Failure is an episode OUTCOME and honors the same currency gate as landing:
      // a rejection for a tuple that is no longer desired must not touch presentation
      // state — publishing it would kill the CURRENT resolution's phase/loading levels
      // and leave a stale failure level no commit clears. Superseded failures are a
      // trace, not state.
      if (!isTupleStillDesired(tuple)) {
        if (__DEV__) {
          logger.info('[RESOLVE] superseded failure dropped', { generation, sliceKey, reason });
        }
        return;
      }
      // Cancellation (session exit aborts the in-flight fetch) is expected lifecycle,
      // not a failure — no failure level, no announcement. Classified HERE, once; the
      // submit owner's handler only decides logging/abort.
      const isCanceled =
        reason.includes('canceled') || reason.includes('runSearch returned no response');
      if (!isCanceled) {
        env.seam.failResolution({ generation, reason });
      }
      args.onResolutionFailed?.(reason);
    }
  };

  const resolveNextPage = async (): Promise<void> => {
    const state = env.searchRuntimeBus.getState();
    const tuple = state.desiredTuple;
    const sliceKey = buildSearchWorldSliceKey(tuple);
    const entry = cache.get(sliceKey);
    if (entry == null || entry.status.kind !== 'ready' || env.fetchNextPageForTuple == null) {
      return;
    }
    const meta = entry.value.paginationMeta;
    if (!meta.canLoadMore || meta.isPaginationExhausted) {
      return;
    }
    // In-flight dedupe on a per-identity append key: a second load-more while page N is
    // in flight attaches (returns) instead of double-fetching.
    const appendKey = `${sliceKey}#append`;
    if (!core.begin({ generation: state.desiredTupleGeneration, worldKey: appendKey })) {
      return;
    }
    env.searchRuntimeBus.publish({ isLoadingMore: true });
    if (__DEV__) {
      logger.info('[RESOLVE] next-page', { sliceKey, targetPage: meta.page + 1 });
    }
    try {
      const fetched = await env.fetchNextPageForTuple({
        tuple,
        baseValue: entry.value,
        targetPage: meta.page + 1,
      });
      const nextEntry = cache.commit({
        worldKey: sliceKey,
        status: { kind: 'ready' },
        value: fetched.value,
        resolvedAt: env.now(),
      });
      core.land({ generation: state.desiredTupleGeneration, worldKey: appendKey }, () => true);
      if (isTupleStillDesired(tuple)) {
        env.seam.commitWorldToMountedState({
          worldId: nextEntry.worldId,
          generation: state.desiredTupleGeneration,
          value: nextEntry.value,
          activeTab: tuple.tab,
          dataReadyFrom: fetched.dataReadyFrom,
          searchInputKey: fetched.searchInputKey,
          requestBounds: tuple.committedBounds?.bounds ?? null,
          isVersionUpdateOfPresentedWorld: true,
        });
      } else {
        // Superseded mid-append (retoggle landed first): the merged value is CACHED for
        // the world's return; nothing presents.
        env.searchRuntimeBus.publish({ isLoadingMore: false });
        if (__DEV__) {
          logger.info('[RESOLVE] next-page superseded, cached', { sliceKey });
        }
      }
    } catch (error) {
      core.fail({ generation: state.desiredTupleGeneration, worldKey: appendKey });
      env.searchRuntimeBus.publish({ isLoadingMore: false });
      logger.warn('[RESOLVE] next-page failed', {
        message: error instanceof Error ? error.message : 'unknown error',
      });
    }
  };

  return {
    resolve,
    resolveNextPage,
    isResolving: () => core.inFlightKeys().length > 0,
    cache,
    core,
  };
};
