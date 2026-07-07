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
  buildSearchCardsWorldKey,
  buildSearchCoverageWorldKey,
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
  }) => Promise<SearchWorldNetworkFetchResult>;
  /** Derivation tier (optional per sub-stage): serve the requested tuple by recomposing
   *  an already-resolved world (tab-only change; page-1 includeSimilar swap). Returns
   *  null when no derivation applies and the ladder falls through to network. */
  deriveWorldForTuple?: (args: {
    tuple: SearchDesiredTuple;
    cardsKey: string;
    cache: SearchWorldCache<SearchWorldValue>;
  }) => SearchWorldNetworkFetchResult | null;
  now: () => number;
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
  /** Invoked SYNCHRONOUSLY after seam.beginResolution (activeOperationId published) and
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
  isResolving: () => boolean;
  cache: SearchWorldCache<SearchWorldValue>;
  core: ResolverCore;
};

export const createSearchWorldResolver = (env: SearchWorldResolverEnv): SearchWorldResolver => {
  const cache = createSearchWorldCache<SearchWorldValue>({
    maxUnpinnedWorlds: WORLD_CACHE_MAX_UNPINNED,
    staleAfterMs: WORLD_CACHE_STALE_AFTER_MS,
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
    const cardsKey = buildSearchCardsWorldKey(tuple);
    const coverageKey = buildSearchCoverageWorldKey(tuple);
    core.observeGeneration(generation);
    env.seam.beginResolution({ generation, presentationIntentKind });
    onResolutionBegan?.();

    // Tier 1 — cache.
    const cached = cache.get(cardsKey);
    if (cached != null && isEntryFresh(cached, tuple.filterVariant.openNow)) {
      if (__DEV__) {
        logger.info('[RESOLVE]', { generation, cause, cardsKey, coverageKey, tier: 'cache' });
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
    const derived = env.deriveWorldForTuple?.({ tuple, cardsKey, cache });
    if (derived != null) {
      const entry = cache.commit({
        worldKey: cardsKey,
        status: { kind: 'ready' },
        value: derived.value,
        resolvedAt: env.now(),
      });
      if (__DEV__) {
        logger.info('[RESOLVE]', { generation, cause, cardsKey, coverageKey, tier: 'derivation' });
      }
      presentEntry({
        entry,
        tuple,
        generation,
        dataReadyFrom: derived.dataReadyFrom,
        searchInputKey: derived.searchInputKey,
        presentationIntentKind,
      });
      return;
    }

    // Tier 3 — network. In-flight dedupe by key; superseded landings commit into cache
    // without presenting (A→B→A retoggle finds both cached).
    const startedFetch = core.begin({ generation, worldKey: cardsKey });
    if (!startedFetch) {
      if (__DEV__) {
        logger.info('[RESOLVE]', {
          generation,
          cause,
          cardsKey,
          coverageKey,
          tier: 'network',
          dedupedInFlight: true,
        });
      }
      return;
    }
    if (__DEV__) {
      logger.info('[RESOLVE]', { generation, cause, cardsKey, coverageKey, tier: 'network' });
    }
    try {
      const fetched = await env.fetchWorldForTuple({ tuple, generation, cause });
      const entry = cache.commit({
        worldKey: cardsKey,
        status: { kind: 'ready' },
        value: fetched.value,
        resolvedAt: env.now(),
      });
      const disposition = core.land({ generation, worldKey: cardsKey }, () =>
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
        logger.info('[RESOLVE] superseded landing cached', { generation, cardsKey });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      core.fail({ generation, worldKey: cardsKey });
      env.seam.failResolution({ generation, reason });
      args.onResolutionFailed?.(reason);
    }
  };

  return {
    resolve,
    isResolving: () => core.inFlightKeys().length > 0,
    cache,
    core,
  };
};
