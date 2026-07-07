// The ONE writer of the desired search tuple (charter §2). Every trigger source calls
// writeSearchDesiredTuple and nothing else; the thin S2 reader adapts tuple changes into
// the existing submit/toggle lanes until S4's reconciler replaces them.
//
// Legacy-key projection (strangler, deleted in S4): the filter keys (openNow, priceLevels,
// risingActive, includeSimilarActive) are published in the SAME batch as the tuple, so the
// many existing readers (chip selectors, request preparation, coverage filter snapshot,
// persist mirror) see one atomic write with ONE writer. Idempotent writes (tuple-equal)
// publish nothing and bump no generation — a re-assert is free by construction.

import { Dimensions } from 'react-native';

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

// The legacy searchMode key is LOAD-BEARING for the map frame: 'shortcut' switches the
// controller into the shortcut-coverage projection (frame waits for a coverage-terminal
// world entry). Only true shortcuts and restaurant-entity taps (which collapse to the
// single-restaurant projection) may claim it; food/attribute entity taps and favorites
// ran the legacy natural lane and must project 'natural' or their coverage-less worlds
// starve the frame.
const deriveLegacySearchMode = (identity: SearchQueryIdentity): 'natural' | 'shortcut' | null =>
  identity.kind === 'natural' || identity.kind === 'entities'
    ? 'natural'
    : identity.kind === 'shortcut'
      ? 'shortcut'
      : identity.kind === 'entity'
        ? identity.entityType === 'restaurant'
          ? 'shortcut'
          : 'natural'
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

type FreshBoundsMapRef = {
  current: {
    getVisibleBounds?: () => Promise<unknown>;
    getCoordinateFromView?: (point: [number, number]) => Promise<unknown>;
  } | null;
};

type FreshBoundsViewportService = Parameters<typeof captureCommittedBounds>[0] & {
  setBounds: (bounds: import('../../../../types').MapBounds) => void;
  captureSearchBaseline: (
    bounds: import('../../../../types').MapBounds,
    polygon: Array<[number, number]>
  ) => void;
};

const isLngLatPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'number';

const boundsFromCornerPairs = (
  a: [number, number],
  b: [number, number]
): import('../../../../types').MapBounds => ({
  northEast: { lat: Math.max(a[1], b[1]), lng: Math.max(a[0], b[0]) },
  southWest: { lat: Math.min(a[1], b[1]), lng: Math.min(a[0], b[0]) },
});

const FRESH_POLYGON_CAPTURE_TIMEOUT_MS = 250;

/** Commit-moment adopt for triggers that must read the SETTLED camera off the native map
 *  (search-this-area, chip reruns after a pan/zoom): awaits the map's visible bounds +
 *  screen-accurate corner polygon, writes both into the viewport service, then returns the
 *  committed bounds. Every failure path falls back to the service's last-known bounds — a
 *  fresh capture is an accuracy upgrade, never a submit blocker (the hung-promise lesson
 *  from request preparation: getCoordinateFromView can hang on a cold map, so the polygon
 *  projection races a timeout). */
export const captureFreshCommittedBounds = async (env: {
  mapRef: FreshBoundsMapRef;
  viewportBoundsService: FreshBoundsViewportService;
}): Promise<SearchCommittedBounds | null> => {
  const map = env.mapRef.current;
  try {
    const visible = map?.getVisibleBounds ? await map.getVisibleBounds() : null;
    if (Array.isArray(visible) && isLngLatPair(visible[0]) && isLngLatPair(visible[1])) {
      env.viewportBoundsService.setBounds(boundsFromCornerPairs(visible[0], visible[1]));
      if (map?.getCoordinateFromView) {
        const { width, height } = Dimensions.get('window');
        if (width > 0 && height > 0) {
          const corners: Array<[number, number]> = [
            [0, 0],
            [width, 0],
            [width, height],
            [0, height],
          ];
          const projection = Promise.all(
            corners.map((point) => map.getCoordinateFromView!(point).catch(() => null))
          );
          const positions = await Promise.race([
            projection,
            new Promise<null>((resolve) => {
              setTimeout(() => resolve(null), FRESH_POLYGON_CAPTURE_TIMEOUT_MS);
            }),
          ]);
          const polygon = (positions ?? []).filter(isLngLatPair);
          if (polygon.length >= 3) {
            const lngs = polygon.map(([lng]) => lng);
            const lats = polygon.map(([, lat]) => lat);
            env.viewportBoundsService.captureSearchBaseline(
              boundsFromCornerPairs(
                [Math.min(...lngs), Math.min(...lats)],
                [Math.max(...lngs), Math.max(...lats)]
              ),
              polygon
            );
          }
        }
      }
    }
  } catch (error) {
    logger.warn('[TUPLE] fresh bounds capture failed — adopting last-known viewport', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }
  return captureCommittedBounds(env.viewportBoundsService);
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
