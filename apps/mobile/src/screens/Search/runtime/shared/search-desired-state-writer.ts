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
  buildSearchCoverageWorldKey,
  type SearchCommittedBounds,
  type SearchDesiredTuple,
  type SearchFilterVariant,
  type SearchQueryIdentity,
  type SearchTupleWriteCause,
} from './search-desired-state-contract';

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
  searchRuntimeBus.publish({
    desiredTuple: next,
    desiredTupleGeneration: generation,
    desiredTupleCause: cause,
    // Legacy projections — read-only elsewhere from S2 on; deleted in S4.
    openNow: next.filterVariant.openNow,
    priceLevels: [...next.filterVariant.priceLevels],
    risingActive: next.filterVariant.rising,
    includeSimilarActive: next.filterVariant.includeSimilar,
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
