// The ONE writer of the desired search tuple (charter §2). Every trigger source calls
// writeSearchDesiredTuple and nothing else; the thin S2 reader adapts tuple changes into
// the existing submit/toggle lanes until S4's reconciler replaces them.
//
// Legacy-key projection (strangler, deleted in S4): the filter keys (openNow, priceLevels,
// risingActive, includeSimilarActive) are published in the SAME batch as the tuple, so the
// many existing readers (chip selectors, request preparation, coverage filter snapshot,
// persist mirror) see one atomic write with ONE writer. Idempotent writes (tuple-equal)
// publish nothing and bump no generation — a re-assert is free by construction.

import { logger } from '../../../../utils';
import type { SearchRuntimeBus } from './search-runtime-bus';
import {
  areSearchDesiredTuplesEqual,
  areSearchQueryIdentitiesEqual,
  buildSearchCoverageWorldKey,
  type SearchCommittedBounds,
  type SearchDesiredTuple,
  type SearchFilterVariant,
  type SearchQueryIdentity,
  type SearchTupleWriteCause,
} from './search-desired-state-contract';

/** Adopt-viewport helper for commit-moment triggers: captures the SETTLED camera the same
 *  way request preparation does (bounds + screen-accurate polygon). */
export const captureCommittedBounds = (viewportBoundsService: {
  getBounds: () => import('../../../../types').MapBounds | null;
  getSubmittedPolygon: () => Array<[number, number]> | null | undefined;
}): SearchCommittedBounds | null => {
  const bounds = viewportBoundsService.getBounds();
  if (bounds == null) {
    return null;
  }
  const polygon = viewportBoundsService.getSubmittedPolygon();
  return {
    bounds,
    viewportPolygon: Array.isArray(polygon)
      ? polygon.map(([lng, lat]) => [lng, lat] as const)
      : null,
  };
};

/** Failure retry (charter: 'failed' is a designed state with a retry affordance).
 *  Re-asserts the CURRENT tuple with a fresh generation — bypassing the tuple-equal
 *  short-circuit — so the reconciler re-classifies desired ≠ presented and re-resolves.
 *  The snackbar Retry, the failed empty state's Retry, and reconnect auto-retry all
 *  call this one function. */
export const retrySearchDesiredResolution = (searchRuntimeBus: SearchRuntimeBus): void => {
  const state = searchRuntimeBus.getState();
  const generation = state.desiredTupleGeneration + 1;
  searchRuntimeBus.publish({
    desiredTuple: { ...state.desiredTuple },
    desiredTupleGeneration: generation,
    desiredTupleCause: 'retry',
  });
  if (__DEV__) {
    logger.info('[TUPLE] retry', {
      generation,
      worldKey: buildSearchCoverageWorldKey(state.desiredTuple),
    });
  }
};

export type SearchDesiredTuplePatch = {
  queryIdentity?: SearchQueryIdentity;
  filterVariant?: Partial<SearchFilterVariant>;
  /** `undefined` = keep current; `null` = explicitly clear (idle). */
  committedBounds?: SearchCommittedBounds | null;
  tab?: 'restaurants' | 'dishes';
};

export type SearchDesiredTupleWriteResult = {
  tuple: SearchDesiredTuple;
  generation: number;
  changed: boolean;
};

export const writeSearchDesiredTuple = (
  searchRuntimeBus: SearchRuntimeBus,
  patch: SearchDesiredTuplePatch,
  cause: SearchTupleWriteCause
): SearchDesiredTupleWriteResult => {
  const state = searchRuntimeBus.getState();
  const prev = state.desiredTuple;
  const next: SearchDesiredTuple = {
    queryIdentity: patch.queryIdentity ?? prev.queryIdentity,
    filterVariant: { ...prev.filterVariant, ...(patch.filterVariant ?? {}) },
    committedBounds:
      patch.committedBounds !== undefined ? patch.committedBounds : prev.committedBounds,
    tab: patch.tab ?? prev.tab,
  };
  if (areSearchDesiredTuplesEqual(prev, next)) {
    return { tuple: prev, generation: state.desiredTupleGeneration, changed: false };
  }
  const generation = state.desiredTupleGeneration + 1;
  const identityChanged =
    patch.queryIdentity != null &&
    !areSearchQueryIdentitiesEqual(prev.queryIdentity, next.queryIdentity);
  searchRuntimeBus.publish({
    desiredTuple: next,
    desiredTupleGeneration: generation,
    desiredTupleCause: cause,
    // S4e: desired tab ≠ presented tab, with NO hint key — chips read tuple.tab
    // directly. An in-session tab toggle is PRESENTED by the reconciler's tab-switch
    // commit (cover → swap → reveal); identity writes and idle-session toggles present
    // immediately (enter builds its own cover; home pill has no choreography).
    ...(patch.tab != null && prev.tab !== next.tab
      ? prev.queryIdentity.kind !== 'idle' &&
        prev.queryIdentity.kind !== 'profileSeed' &&
        !identityChanged
        ? {}
        : { activeTab: next.tab }
      : {}),
  });
  if (__DEV__) {
    // The append-only trace (charter §1: measurement labels, never lifecycle).
    logger.info('[TUPLE] write', {
      generation,
      cause,
      worldKey: buildSearchCoverageWorldKey(next),
    });
  }
  return { tuple: next, generation, changed: true };
};
