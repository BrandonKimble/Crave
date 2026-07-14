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
      kind: 'list';
      /** Favorites-as-search / shared lists (S-D.2 §5.2): the list IS the identity — the
       *  resolver fetches by listId (getListResults). The old 'entities' id-set piggyback
       *  (always-empty restaurantIds/foodIds + nullable listId with a throw arm) is dead. */
      listId: string;
      listType: 'restaurant' | 'dish';
      /** Presentation title for the results header (the list name). */
      displayTitle: string;
      /** The list OWNER when opened from ANOTHER user's surface (profile gallery).
       *  Identity-relevant: it scopes virtual-All unions and viewer-role resolution —
       *  the same virtual id under two owners is two different worlds. */
      targetUserId?: string | null;
      /** RT-18 ACCESS MATERIAL, never identity: the share slug IS the capability for
       *  shared reads — presented on the server fetch, deliberately EXCLUDED from
       *  identityKey and equality (same viewer + same list = same world regardless
       *  of which capability opened it). */
      shareSlug?: string | null;
    }
  | {
      kind: 'entity';
      /** Poll-comment / autocomplete entity tap: one entity, skip-LLM lane. Restaurant
       *  taps fetch structured; food/attribute taps fetch natural + submissionContext. */
      entityType: 'restaurant' | 'food' | 'food_attribute' | 'restaurant_attribute';
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
  /** LIST worlds only (wave-4 §3 strip 'world' flip): the saver-ranking sort axis. A
   *  re-sort is a variant rerun of the SAME list identity — it re-ranks (badges renumber)
   *  without changing membership, so it keys the world (cache) but never the identity.
   *  Absent/undefined ⇒ the server applies the list's own defaultSort. */
  listSort?: 'custom' | 'best' | 'recent';
  /** LIST worlds only: the market (city) slice — virtual-All lists slice by city (§8.16).
   *  A market flip changes MEMBERSHIP (map pins re-slice), so it keys the world. Absent/
   *  null ⇒ all markets. */
  marketKey?: string | null;
};

/** The viewport adopted at a commit moment — a frozen snapshot, never a live read.
 *  Everything that later needs "where this search was run" (the resolver's bounds, the
 *  dismiss-restore camera) reads THIS value; pairing these bounds with a camera from a
 *  second tracker is the dual-source bug class (cd59e8a2). */
export type SearchCommittedBounds = {
  bounds: MapBounds;
  /** Screen-accurate viewport polygon captured at the same commit moment. */
  viewportPolygon: ReadonlyArray<readonly [number, number]> | null;
  /** The camera ({center: [lng, lat], zoom}) from the same commit-moment viewport event
   *  as `bounds`. Null only when no camera event had landed by capture time. Excluded
   *  (like viewportPolygon) from equality and world keys: revise classification and
   *  caching are bounds-facts, and folding the camera in would phantom-classify
   *  same-bounds recaptures as area_reruns. */
  camera: { center: [number, number]; zoom: number } | null;
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
  /** The resolver adopts the response-derived tab for natural identities (the ONE
   *  writer rule: even the resolver's own adopt is a tuple write). */
  | 'response_tab_adopt'
  | 'favorites_launch'
  /** A list world's strip re-slice (sort/open-now/price/market): same list identity,
   *  new filterVariant → the reconciler classifies it variant_rerun (map + cards
   *  re-slice together). Distinct from favorites_launch (the initial enter). */
  | 'list_reslice'
  | 'entity_tap'
  | 'profile_seed'
  | 'deep_link'
  | 'dismiss'
  | 'boot_seed'
  /** Failure retry: re-asserts the CURRENT tuple with a fresh generation so the
   *  reconciler re-resolves desired ≠ presented (snackbar Retry, empty-state Retry,
   *  reconnect auto-retry — one mechanism). */
  | 'retry';

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
    case 'list': {
      const other = b as Extract<SearchQueryIdentity, { kind: 'list' }>;
      return (
        a.displayTitle === other.displayTitle &&
        a.listId === other.listId &&
        a.listType === other.listType &&
        (a.targetUserId ?? null) === (other.targetUserId ?? null)
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
  (a.listSort ?? null) === (b.listSort ?? null) &&
  (a.marketKey ?? null) === (b.marketKey ?? null) &&
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
        : identity.kind === 'list'
          ? `list:${identity.listId}:${identity.listType}${identity.targetUserId != null ? `:u:${identity.targetUserId}` : ''}`
          : identity.kind === 'entity'
            ? `entity:${identity.entityType}:${identity.entityId}`
            : identity.kind === 'profileSeed'
              ? `profileSeed:${identity.restaurantId}`
              : 'idle';
  const filters = tuple.filterVariant;
  // listSort/marketKey are LIST-world variant axes — appended only when present so
  // non-list worlds keep their exact historical key (empty suffix), and a list re-sort
  // or market flip mints a distinct world (cache correctness: a different ordering /
  // city is a different resolved result).
  const listVariantKey = `${filters.listSort != null ? `|sort:${filters.listSort}` : ''}${filters.marketKey != null ? `|mkt:${filters.marketKey}` : ''}`;
  const filtersKey = `open:${filters.openNow ? 1 : 0}|price:${filters.priceLevels.join(',')}|rising:${filters.rising ? 1 : 0}|similar:${filters.includeSimilar ? 1 : 0}${listVariantKey}`;
  const bounds = tuple.committedBounds;
  const boundsKey =
    bounds == null
      ? 'none'
      : `${bounds.bounds.northEast.lat.toFixed(5)},${bounds.bounds.northEast.lng.toFixed(5)},${bounds.bounds.southWest.lat.toFixed(5)},${bounds.bounds.southWest.lng.toFixed(5)}`;
  return `${identityKey}||${filtersKey}||${boundsKey}`;
};

export const buildSearchCoverageWorldKey = (tuple: SearchDesiredTuple): string =>
  `${buildSearchCardsWorldKey(tuple)}||tab:${tuple.tab}`;
