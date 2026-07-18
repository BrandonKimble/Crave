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
   *  part of the template, never chosen at a call site. */
  placeholder: { count: number };
  /** The DECLARED empty view (an L2 spec slot, not a panel branch). */
  Empty: React.ComponentType;
};

export type PageStaticBodySpec = {
  kind: 'static';
  scene: SheetSceneKey;
  /** A body with no page-level query — always present by construction (settings).
   *  Inline SECTION loading inside it (squircle rows) is a different, sanctioned
   *  class; the PAGE can never skeleton. */
  Content: React.ComponentType;
};

export type PageBodySpec<TItem> = PageListBodySpec<TItem> | PageStaticBodySpec;

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
