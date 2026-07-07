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

const deriveLegacySearchMode = (identity: SearchQueryIdentity): 'natural' | 'shortcut' | null =>
  identity.kind === 'natural'
    ? 'natural'
    : identity.kind === 'shortcut' || identity.kind === 'entities' || identity.kind === 'entity'
      ? 'shortcut'
      : null;

const deriveLegacySubmittedQuery = (identity: SearchQueryIdentity): string =>
  identity.kind === 'natural'
    ? identity.query
    : identity.kind === 'shortcut'
      ? identity.shortcutTab === 'restaurants'
        ? 'Best restaurants'
        : 'Best dishes'
      : identity.kind === 'entities'
        ? identity.displayTitle
        : identity.kind === 'entity'
          ? identity.displayName
          : '';

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
  // Legacy projections — read-only elsewhere from S2 on; deleted in S4. Only CHANGED keys
  // are included (the bus Object.is-guards per key; a fresh-but-equal array would spuriously
  // notify priceLevels subscribers — the bridge's value-compare lesson).
  const identityChanged =
    patch.queryIdentity != null &&
    !areSearchQueryIdentitiesEqual(prev.queryIdentity, next.queryIdentity);
  const priceChanged =
    prev.filterVariant.priceLevels.length !== next.filterVariant.priceLevels.length ||
    next.filterVariant.priceLevels.some(
      (value, index) => value !== prev.filterVariant.priceLevels[index]
    );
  searchRuntimeBus.publish({
    desiredTuple: next,
    desiredTupleGeneration: generation,
    desiredTupleCause: cause,
    ...(prev.filterVariant.openNow !== next.filterVariant.openNow
      ? { openNow: next.filterVariant.openNow }
      : {}),
    ...(priceChanged ? { priceLevels: [...next.filterVariant.priceLevels] } : {}),
    ...(prev.filterVariant.rising !== next.filterVariant.rising
      ? { risingActive: next.filterVariant.rising }
      : {}),
    ...(prev.filterVariant.includeSimilar !== next.filterVariant.includeSimilar
      ? { includeSimilarActive: next.filterVariant.includeSimilar }
      : {}),
    // Identity-derived projections publish ONLY on identity change (a chip write while the
    // identity conversion is still lane-owned must never null searchMode).
    ...(identityChanged
      ? {
          searchMode: deriveLegacySearchMode(next.queryIdentity),
          submittedQuery: deriveLegacySubmittedQuery(next.queryIdentity),
          isSearchSessionActive:
            next.queryIdentity.kind !== 'idle' && next.queryIdentity.kind !== 'profileSeed',
        }
      : {}),
    ...(patch.tab != null && prev.tab !== next.tab ? { activeTab: next.tab } : {}),
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
