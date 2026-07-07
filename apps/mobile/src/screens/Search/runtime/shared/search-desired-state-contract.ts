// The DESIRED SEARCH TUPLE — the single writer surface for every search trigger.
// Chartered in plans/search-desired-state-architecture.md §2 (three-value model).
//
// Every trigger source — chip, tab pill, price-sheet Done, search-this-area tap, initial
// submit (shortcut or typed), favorites-list launch, poll entity tap, deep link, future
// pick-mode — does exactly ONE thing: write this tuple. No source runs a flow.
//
// Rules (binding, from the charter):
// - `queryIdentity` is a SUM TYPE. Everything that paints the map is a tuple kind —
//   including the profile seed and restaurant-only overlays that used to write the map
//   out-of-model. One writer surface is only true if this union is total.
// - `committedBounds` enters the tuple ONLY at commit moments (each trigger has an
//   adopt-viewport policy; "commit moment" reads the SETTLED camera). The live camera is
//   an EPHEMERAL VIEW INPUT: it derives chrome (search-this-area chip visibility =
//   live ≠ committed) and never enters the tuple.
// - DRAFT is a third input class: price-sheet sliders and typed-but-unsubmitted query
//   text are widget-owned buffers, invisible to the reconciler, committed as one tuple
//   write at the commit gesture.
// - The persist mirror seeds the tuple ONCE at boot and is write-through-only after.

import type { MapBounds } from '../../../../types';

/** Which search world the user is asking for — total across every map-painting surface. */
export type SearchQueryIdentity =
  | {
      kind: 'natural';
      query: string;
    }
  | {
      kind: 'shortcut';
      /** The shortcut axis the label derives from; the label itself is presentation. */
      shortcutTab: 'restaurants' | 'dishes';
    }
  | {
      kind: 'entities';
      /** Favorites-as-search / shared lists: explicit entity id sets, no LLM. */
      restaurantIds: readonly string[];
      foodIds: readonly string[];
      /** Presentation title for the results header (e.g. the list name). */
      displayTitle: string;
    }
  | {
      kind: 'entity';
      /** Poll-comment / autocomplete entity tap: one entity, skip-LLM lane. */
      entityType: 'restaurant' | 'food';
      entityId: string;
      displayName: string;
    }
  | {
      kind: 'profileSeed';
      /** A restaurant profile opened with seeded data before any search exists.
       *  Resolves via ZERO-NETWORK derivation (the seed payload IS the world). */
      restaurantId: string;
    }
  | {
      kind: 'idle';
      /** No search world desired (home). The reconciler treats idle as "dismiss to
       *  resident-dormant" — never a teardown. */
    };

/** Server-resolved filter variant. Every field is part of the resolution key. */
export type SearchFilterVariant = {
  openNow: boolean;
  /** Normalized ascending price levels; empty = any. */
  priceLevels: readonly number[];
  rising: boolean;
  /** Session-scoped; page-1 flips are derivations, mid-pagination flips re-resolve. */
  includeSimilar: boolean;
};

/** Bounds adopted at a commit moment — never the live camera. */
export type SearchCommittedBounds = {
  bounds: MapBounds;
  /** Screen-accurate viewport polygon captured at the same commit moment. */
  viewportPolygon: ReadonlyArray<readonly [number, number]> | null;
};

export type SearchDesiredTuple = {
  queryIdentity: SearchQueryIdentity;
  filterVariant: SearchFilterVariant;
  committedBounds: SearchCommittedBounds | null;
  tab: 'restaurants' | 'dishes';
};

/** Measurement label carried with every tuple write (append-only trace; labels never own
 *  lifecycle). */
export type SearchTupleWriteCause =
  | 'initial_submit'
  | 'chip_open_now'
  | 'chip_rising'
  | 'chip_price'
  | 'chip_include_similar'
  | 'tab_toggle'
  | 'search_this_area'
  | 'favorites_launch'
  | 'entity_tap'
  | 'profile_seed'
  | 'deep_link'
  | 'dismiss'
  | 'boot_seed';

export const DEFAULT_SEARCH_FILTER_VARIANT: SearchFilterVariant = {
  openNow: false,
  priceLevels: [],
  rising: false,
  includeSimilar: false,
};

export const IDLE_SEARCH_DESIRED_TUPLE: SearchDesiredTuple = {
  queryIdentity: { kind: 'idle' },
  filterVariant: DEFAULT_SEARCH_FILTER_VARIANT,
  committedBounds: null,
  tab: 'restaurants',
};

const areNumberArraysEqual = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

export const areSearchQueryIdentitiesEqual = (
  a: SearchQueryIdentity,
  b: SearchQueryIdentity
): boolean => {
  if (a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case 'natural':
      return a.query === (b as Extract<SearchQueryIdentity, { kind: 'natural' }>).query;
    case 'shortcut':
      return (
        a.shortcutTab === (b as Extract<SearchQueryIdentity, { kind: 'shortcut' }>).shortcutTab
      );
    case 'entities': {
      const other = b as Extract<SearchQueryIdentity, { kind: 'entities' }>;
      return (
        a.displayTitle === other.displayTitle &&
        a.restaurantIds.length === other.restaurantIds.length &&
        a.restaurantIds.every((id, index) => id === other.restaurantIds[index]) &&
        a.foodIds.length === other.foodIds.length &&
        a.foodIds.every((id, index) => id === other.foodIds[index])
      );
    }
    case 'entity': {
      const other = b as Extract<SearchQueryIdentity, { kind: 'entity' }>;
      return a.entityType === other.entityType && a.entityId === other.entityId;
    }
    case 'profileSeed':
      return (
        a.restaurantId === (b as Extract<SearchQueryIdentity, { kind: 'profileSeed' }>).restaurantId
      );
    case 'idle':
      return true;
  }
};

export const areSearchCommittedBoundsEqual = (
  a: SearchCommittedBounds | null,
  b: SearchCommittedBounds | null
): boolean => {
  if (a == null || b == null) {
    return a === b;
  }
  return (
    a.bounds.northEast.lat === b.bounds.northEast.lat &&
    a.bounds.northEast.lng === b.bounds.northEast.lng &&
    a.bounds.southWest.lat === b.bounds.southWest.lat &&
    a.bounds.southWest.lng === b.bounds.southWest.lng
  );
};

export const areSearchFilterVariantsEqual = (
  a: SearchFilterVariant,
  b: SearchFilterVariant
): boolean =>
  a.openNow === b.openNow &&
  a.rising === b.rising &&
  a.includeSimilar === b.includeSimilar &&
  areNumberArraysEqual(a.priceLevels, b.priceLevels);

export const areSearchDesiredTuplesEqual = (
  a: SearchDesiredTuple,
  b: SearchDesiredTuple
): boolean =>
  a.tab === b.tab &&
  areSearchQueryIdentitiesEqual(a.queryIdentity, b.queryIdentity) &&
  areSearchFilterVariantsEqual(a.filterVariant, b.filterVariant) &&
  areSearchCommittedBoundsEqual(a.committedBounds, b.committedBounds);

/** Canonical serialized identity for cache keys and the append-only trace.
 *  cardsWorld key = tuple minus tab; coverageWorld key = full tuple (charter §3). */
export const buildSearchCardsWorldKey = (tuple: SearchDesiredTuple): string => {
  const identity = tuple.queryIdentity;
  const identityKey =
    identity.kind === 'natural'
      ? `natural:${identity.query.trim().toLowerCase()}`
      : identity.kind === 'shortcut'
        ? `shortcut:${identity.shortcutTab}`
        : identity.kind === 'entities'
          ? `entities:${identity.restaurantIds.join(',')}|${identity.foodIds.join(',')}`
          : identity.kind === 'entity'
            ? `entity:${identity.entityType}:${identity.entityId}`
            : identity.kind === 'profileSeed'
              ? `profileSeed:${identity.restaurantId}`
              : 'idle';
  const filters = tuple.filterVariant;
  const filtersKey = `open:${filters.openNow ? 1 : 0}|price:${filters.priceLevels.join(',')}|rising:${filters.rising ? 1 : 0}|similar:${filters.includeSimilar ? 1 : 0}`;
  const bounds = tuple.committedBounds;
  const boundsKey =
    bounds == null
      ? 'none'
      : `${bounds.bounds.northEast.lat.toFixed(5)},${bounds.bounds.northEast.lng.toFixed(5)},${bounds.bounds.southWest.lat.toFixed(5)},${bounds.bounds.southWest.lng.toFixed(5)}`;
  return `${identityKey}||${filtersKey}||${boundsKey}`;
};

export const buildSearchCoverageWorldKey = (tuple: SearchDesiredTuple): string =>
  `${buildSearchCardsWorldKey(tuple)}||tab:${tuple.tab}`;
