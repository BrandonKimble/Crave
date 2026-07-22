import type React from 'react';

import type { SceneLoadingRowType } from '../components/skeletons';
import type { SheetSceneKey } from '../navigation/runtime/scene-foundation-spec';
import type { SceneLoadFailure } from './scene-load-failure-policy';

// ─── THE PAGE BODY CONTRACT (THE PAGE L2) ───────────────────────────────────────────
//
// A page's body is a DECLARATION (an immutable module-scope PageBodySpec with its slot
// components inline — no registry to disagree with) interpreted by ONE shell
// (PageBodyShell). The two laws this file makes structural:
//
// - SLOTS CARRY DATA, not components-with-queries: row/empty/content slots receive
//   already-resolved values; the query lives in the page CONTROLLER (a hook returning
//   PageBodyState), structurally unreachable from render code. A row component cannot
//   express a pending branch because the pending case never renders it.
// - THE BODY STATE ENUM IS CLOSED AND TOTAL: pending | present | empty | error |
//   appending. A panel-level loading/error/empty branch has no state left to express —
//   pending renders the one L0 material at the scene's declared row geometry, error
//   keeps the material while the wave-4 failure law announces (one chokepoint in the
//   shell), empty renders the DECLARED empty view.

/** THE CLOSED BODY STATE — total across every page body. */
export type PageBodyState<TItem> =
  | { kind: 'pending' }
  | { kind: 'present'; items: readonly TItem[] }
  | { kind: 'empty' }
  | { kind: 'error'; failure: SceneLoadFailure }
  | { kind: 'appending'; items: readonly TItem[] };

/** ONE BODY BAND's TEMPLATE (L1 A#14/B#15 — BodySpec is an ordered set of body bands
 *  with one active): band identity + row identity/geometry + the pending-face
 *  template. This is the vocabulary BOTH interpreters share — PageBodyShell list
 *  bodies (whose bands additionally declare the row Component + Empty inline, below)
 *  and transport-hosted FlashList bodies (the search family), whose row render is the
 *  sanctioned controller-closure slot but whose TEMPLATE FACTS (keys, keyOf, row
 *  geometry, material shape, placeholder) live here so there is exactly one home.
 *  Bands are ITEM-TYPE-ERASED in specs (each band's items are its own vocabulary —
 *  restaurants vs dishes); type safety lives at the constructors below. */
export type PageBandTemplate = {
  /** Band identity — the active-band input and the bandStates key. */
  key: string;
  keyOf: (item: never, index: number) => string;
  /** Row-template GEOMETRY for virtualized (FlashList) interpreters — the declared
   *  estimated row height (the old per-site 240/270 literals). */
  estimatedRowHeight?: number;
  /** Per-band material row SHAPE for the pending face — a dish band's holes are
   *  dish-shaped even when the scene-level material says restaurant. Omitted = the
   *  scene's declared material rowType. */
  materialRowType?: SceneLoadingRowType;
  /** THE ROW TEMPLATE's pending face: how many rows of the material the interpreter
   *  paints while pending/appending — part of the template, never chosen at a call
   *  site. `insetX` is template GEOMETRY: 0 when the body renders inside a
   *  transport-inset container (the holes must not re-inset — the double-inset
   *  skeleton-vs-content jump class); omitted = the material's full-width default. */
  placeholder: { count: number; insetX?: number };
  /** The DECLARED empty view. Optional at the template level: a transport band whose
   *  empty surface composes runtime data (the results empty carries metadata copy +
   *  notices) keeps that surface controller-side; shell bands require it (below). */
  Empty?: React.ComponentType;
};

/** A SHELL-interpreted band: the template plus the inline row slot and the required
 *  empty view — everything PageBodyShell renders is declared here. */
export type PageListBandSpec = PageBandTemplate & {
  row: {
    /** The row slot — receives a resolved item, nothing else. */
    Component: React.ComponentType<{ item: never }>;
  };
  Empty: React.ComponentType;
};

/** THE legal shell-band constructor: checks Component/keyOf against the band's item
 *  type at the declaration site, then erases — a band whose row component disagrees
 *  with its keyOf is a compile error where the band is written. */
export const defineListBand = <TItem,>(band: {
  key: string;
  keyOf: (item: TItem, index: number) => string;
  estimatedRowHeight?: number;
  materialRowType?: SceneLoadingRowType;
  placeholder: { count: number; insetX?: number };
  row: { Component: React.ComponentType<{ item: TItem }> };
  Empty: React.ComponentType;
}): PageListBandSpec => band as unknown as PageListBandSpec;

/** THE legal transport-band-template constructor (FlashList bodies hosted by the
 *  scene transport — the search family): declares the template facts; the row render
 *  stays the family's runtime slot, so there is no component to cross-check keyOf
 *  against here — a TYPED keyOf function carries its own item vocabulary
 *  (contravariance makes it assignable to the erased slot). The return type keeps
 *  every declared field NARROW: a band that declares estimatedRowHeight exports
 *  `number`, not `number | undefined`. */
type PageBandTemplateInput = {
  key: string;
  keyOf: (item: never, index: number) => string;
  estimatedRowHeight?: number;
  materialRowType?: SceneLoadingRowType;
  placeholder: { count: number; insetX?: number };
  Empty?: React.ComponentType;
};

export const defineBandTemplate = <TBand extends PageBandTemplateInput>(band: TBand): TBand =>
  band;

export type PageListBodySpec = {
  kind: 'list';
  scene: SheetSceneKey;
  /** ORDERED BODY BANDS, exactly one active at a time (A#14/B#15 — decided): the
   *  search results dual-tab body is two bands in one shell; a tab toggle is
   *  intra-shell band visibility, never a scene transition. One band is the trivial
   *  case (most pages). Each band carries its OWN closed PageBodyState — restaurants
   *  can be present while dishes is still pending. */
  bands: readonly [PageListBandSpec, ...PageListBandSpec[]];
};

/** A COLLECTION body (bookmarks): the full closed enum over one resolved collection,
 *  but the present face is a COMPOSITION (tile grid, edit-mode reorder, interleaved
 *  affordances) rather than per-row slots — the Content slot receives the resolved
 *  items and owns the arrangement; load states never reach it. */
export type PageCollectionBodySpec<TItem> = {
  kind: 'collection';
  scene: SheetSceneKey;
  Content: React.ComponentType<{ items: readonly TItem[] }>;
  /** THE pending face template (see PageListBodySpec.placeholder — same geometry law). */
  placeholder: { count: number; insetX?: number };
  /** The DECLARED empty view — only correct once the collection RESOLVES empty. */
  Empty: React.ComponentType;
};

/** A single-entity QUERY-backed body (userProfile): the content slot receives the
 *  RESOLVED data — pending/error never render it. Its state enum is the content
 *  subset of the closed enum: a single entity has no empty/appending arm (a settled
 *  query with no entity is a load FAILURE, not an empty list). */
export type PageContentBodyState<TData> =
  | { kind: 'pending' }
  | { kind: 'present'; data: TData }
  | { kind: 'error'; failure: SceneLoadFailure };

export type PageContentBodySpec<TData> = {
  kind: 'content';
  scene: SheetSceneKey;
  Content: React.ComponentType<{ data: TData }>;
};

export type PageStaticBodySpec = {
  kind: 'static';
  scene: SheetSceneKey;
  /** A body with no page-level query — always present by construction (settings).
   *  Inline SECTION loading inside it (squircle rows) is a different, sanctioned
   *  class; the PAGE can never skeleton. */
  Content: React.ComponentType;
};

export type PageBodySpec<TItem> =
  | PageListBodySpec
  | PageCollectionBodySpec<TItem>
  | PageContentBodySpec<TItem>
  | PageStaticBodySpec;

/**
 * THE canonical query-edge → body-state derivation, so controllers never hand-roll the
 * mapping (the old per-panel LoadState machines were exactly that hand-rolling).
 * Error wins over pending (the failure law announces; the material stays); null items
 * while not pending is still pending (a settled query with no data has nothing to
 * present).
 */
export const resolvePageBodyListState = <TItem,>(args: {
  isPending: boolean;
  isError: boolean;
  /** Human noun for the failure modal ("your notifications"). */
  what: string;
  items: readonly TItem[] | null | undefined;
  retry?: () => void;
  isAppending?: boolean;
}): PageBodyState<TItem> => {
  if (args.isError) {
    return { kind: 'error', failure: { isError: true, what: args.what, retry: args.retry } };
  }
  if (args.isPending || args.items == null) {
    return { kind: 'pending' };
  }
  if (args.items.length === 0) {
    return { kind: 'empty' };
  }
  return args.isAppending === true
    ? { kind: 'appending', items: args.items }
    : { kind: 'present', items: args.items };
};

/** The content-body twin of resolvePageBodyListState: error wins; a SETTLED query
 *  with null data is an error by law (an entity page with nothing to show failed —
 *  this is exactly the old hand-rolled `!isPending && data == null` gate, now
 *  unrepresentable to get wrong). */
export const resolvePageContentBodyState = <TData,>(args: {
  isPending: boolean;
  isError: boolean;
  what: string;
  data: TData | null | undefined;
  retry?: () => void;
}): PageContentBodyState<TData> => {
  if (args.isError || (!args.isPending && args.data == null)) {
    return { kind: 'error', failure: { isError: true, what: args.what, retry: args.retry } };
  }
  if (args.isPending || args.data == null) {
    return { kind: 'pending' };
  }
  return { kind: 'present', data: args.data };
};
