import type React from 'react';

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

export type PageListBodySpec<TItem> = {
  kind: 'list';
  scene: SheetSceneKey;
  row: {
    /** The row slot — receives a resolved item, nothing else. */
    Component: React.ComponentType<{ item: TItem }>;
    keyOf: (item: TItem) => string;
  };
  /** THE ROW TEMPLATE's pending face: how many rows of the scene's declared L0
   *  material (foundation table rowType) the shell paints while pending/appending —
   *  part of the template, never chosen at a call site. `insetX` is template GEOMETRY:
   *  0 when the body renders inside a transport-inset container (the holes must not
   *  re-inset — the double-inset skeleton-vs-content jump class); omitted = the
   *  material's full-width default. */
  placeholder: { count: number; insetX?: number };
  /** The DECLARED empty view (an L2 spec slot, not a panel branch). */
  Empty: React.ComponentType;
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
  | PageListBodySpec<TItem>
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
