// ─── THE SHEET-MOTION DESCRIPTOR TABLE (page-switch-master-plan.md §6-P6, owner req 2d) ──────
//
// ONE declarative table answering "which detent does the shared sheet move to for this switch"
// for every (fromScene, toScene, transitionKind) — nav pages AND child sheets, both directions.
// This is the P6 step-1 relocation of the old scattered per-transitionKind switch that lived in
// resolveDefaultSheetMotionPlan (app-route-scene-transition-policy-runtime.ts): the DECISION now
// lives here as data; the KEPT snap spring still executes the motion (this module never touches
// the executor). Tuning how a page moves — e.g. the poll-card → poll-detail open, or its dismiss
// — is a ROW EDIT here, never an engine change; future child scenes inherit the wildcard rows.
//
// PRECEDENCE (most-specific row wins):
//   1. Rows are matched on (from, to, transitionKind); '*' matches anything.
//   2. Specificity score = (to exact ? 4 : 0) + (transitionKind exact ? 2 : 0) + (from exact ? 1 : 0).
//      Highest score wins; the TARGET scene dominates, then the kind, then the source.
//   3. Ties are illegal (asserted in __DEV__ at module init): no two rows may match the same
//      (from, to, kind) at the same score. Declaration order is NOT load-bearing.
//   4. tier 'mandate' rows outrank even a call-site explicit snapTarget (today: the modal scenes
//      never move the shared sheet). tier 'default' rows (the rest) apply only when the call site
//      passed no explicit snapTarget and no explicit sheetMotion.
//   5. The ('*','*','*') catch-all guarantees every switch resolves to exactly one row
//      (invariant T1, master-plan §2).
//
// OWNER DEFAULTS ENCODED (2026-07-01 decisions; rememberedDetent semantics upgraded 2026-07-02):
//   • Nav switches (topLevelSwitch) = PER-PAGE REMEMBERED DETENT: bookmarks/profile return to
//     THEIR OWN last-settled detent ('rememberedDetent' — the per-scene snap ledger, true
//     per-page memory) and fall back to 'expanded' when that page has no usable memory yet
//     (unvisited, or last left hidden/collapsed — a collapsed sheet would hide their content);
//     search/polls dock at 'collapsed' (the map-first home posture).
//   • Child opens keep the curated snaps: full-page children (saveList/pollCreation/pollDetail)
//     open 'expanded'; restaurant promotes to at least 'middle'.
//   • Dismiss rows mirror the pre-table behavior byte-identically: closeChild leaves the sheet
//     where it is (preserveLiveY — the body swaps back with no shell motion); terminalDismiss
//     hides the sheet.

import type {
  BottomSheetMotionCommand,
  BottomSheetSnap,
} from '../../overlays/bottomSheetMotionTypes';
import type { OverlayKey } from '../../overlays/types';
import type {
  RouteSceneSwitchSheetMotionPlan,
  RouteSceneSwitchSheetTransitionKind,
} from './app-overlay-route-transition-contract';

export type SheetMotionDescriptorScene = OverlayKey | '*';
export type SheetMotionDescriptorKind = RouteSceneSwitchSheetTransitionKind | '*';

/**
 * A row's motion rule. The static variants ARE the existing RouteSceneSwitchSheetMotionPlan
 * shapes (snapTo / promoteAtLeast / preserveLiveY / hide / none — the kept spring's vocabulary).
 * 'rememberedDetent' is the one derived rule: snap to the TARGET scene's own remembered detent
 * when usable (middle/expanded), else snap to `fallbackSnap`.
 */
export type SheetMotionDescriptorRule =
  | RouteSceneSwitchSheetMotionPlan
  | {
      kind: 'rememberedDetent';
      fallbackSnap: Exclude<BottomSheetSnap, 'hidden'>;
      mode?: BottomSheetMotionCommand['mode'];
    };

export type SheetMotionDescriptorRow = {
  from: SheetMotionDescriptorScene;
  to: SheetMotionDescriptorScene;
  transitionKind: SheetMotionDescriptorKind;
  /** 'mandate' rows outrank a call-site explicit snapTarget. Omitted = 'default'. */
  tier?: 'mandate';
  motion: SheetMotionDescriptorRule;
};

// ─── THE TABLE ───────────────────────────────────────────────────────────────────────────────
export const SHEET_MOTION_DESCRIPTOR_TABLE: readonly SheetMotionDescriptorRow[] = [
  // MANDATES — modal scenes render outside the shared sheet; the sheet NEVER moves for them,
  // even if a call site passes an explicit snapTarget.
  { from: '*', to: 'price', transitionKind: '*', tier: 'mandate', motion: { kind: 'none' } },
  { from: '*', to: 'scoreInfo', transitionKind: '*', tier: 'mandate', motion: { kind: 'none' } },

  // TERMINAL DISMISS — the sheet leaves the screen.
  { from: '*', to: '*', transitionKind: 'terminalDismiss', motion: { kind: 'hide' } },

  // CHILD OPENS (curated per-child snaps). Full-page children rise to expanded; the restaurant
  // half-sheet promotes to at least middle (never demotes an expanded sheet).
  {
    from: '*',
    to: 'saveList',
    transitionKind: 'openChild',
    motion: { kind: 'snapTo', snap: 'expanded' },
  },
  // pollCreation opens as an INSTANT expanded cover (no rise): the full-screen form snaps over
  // the partial feed in one frame. This mode rode the revealRoute call site pre-table; it is the
  // row's decision now (flow behavior unchanged).
  {
    from: '*',
    to: 'pollCreation',
    transitionKind: 'openChild',
    motion: { kind: 'snapTo', snap: 'expanded', mode: 'instant' },
  },
  {
    from: '*',
    to: 'pollDetail',
    transitionKind: 'openChild',
    motion: { kind: 'snapTo', snap: 'expanded' },
  },
  {
    from: '*',
    to: 'restaurant',
    transitionKind: 'openChild',
    motion: { kind: 'promoteAtLeast', snap: 'middle' },
  },
  // Stub-pass full-page children (plans/page-registry.md §1) — open at expanded like saveList.
  {
    from: '*',
    to: 'userProfile',
    transitionKind: 'openChild',
    motion: { kind: 'snapTo', snap: 'expanded' },
  },
  {
    from: '*',
    to: 'listDetail',
    transitionKind: 'openChild',
    motion: { kind: 'snapTo', snap: 'expanded' },
  },
  {
    from: '*',
    to: 'followList',
    transitionKind: 'openChild',
    motion: { kind: 'snapTo', snap: 'expanded' },
  },
  {
    from: '*',
    to: 'notifications',
    transitionKind: 'openChild',
    motion: { kind: 'snapTo', snap: 'expanded' },
  },
  {
    from: '*',
    to: 'settings',
    transitionKind: 'openChild',
    motion: { kind: 'snapTo', snap: 'expanded' },
  },
  {
    from: '*',
    to: 'editProfile',
    transitionKind: 'openChild',
    motion: { kind: 'snapTo', snap: 'expanded' },
  },
  {
    from: '*',
    to: 'shareConfig',
    transitionKind: 'openChild',
    motion: { kind: 'snapTo', snap: 'expanded' },
  },

  // CHILD DISMISS (owner req 2d example — the poll-detail pair). closeChild leaves the sheet at
  // its live Y while the body swaps back to the parent. This row equals the catch-all on purpose:
  // it exists so the poll-detail DISMISS pattern is a visible, directly-editable row.
  {
    from: 'pollDetail',
    to: '*',
    transitionKind: 'closeChild',
    motion: { kind: 'preserveLiveY' },
  },
  // ── OWNER TUNING EXAMPLE (req 2d): to change the poll-card → poll-detail movement pattern,
  // edit the two pollDetail rows above — nothing else. E.g. "open only to middle, dismiss by
  // dropping the sheet to collapsed" would be:
  //   { from: '*', to: 'pollDetail', transitionKind: 'openChild',
  //     motion: { kind: 'snapTo', snap: 'middle' } },
  //   { from: 'pollDetail', to: '*', transitionKind: 'closeChild',
  //     motion: { kind: 'snapTo', snap: 'collapsed' } },
  // (replacing the current pair). The engine, the spring, and every other flow are untouched.

  // NAV-PAGE SWITCHES (topLevelSwitch). search/polls dock collapsed (map-first home);
  // bookmarks/profile return to the remembered detent, entering at expanded from a
  // collapsed/hidden sheet.
  {
    from: '*',
    to: 'search',
    transitionKind: 'topLevelSwitch',
    motion: { kind: 'snapTo', snap: 'collapsed' },
  },
  {
    from: '*',
    to: 'polls',
    transitionKind: 'topLevelSwitch',
    motion: { kind: 'snapTo', snap: 'collapsed' },
  },
  {
    from: '*',
    to: 'bookmarks',
    transitionKind: 'topLevelSwitch',
    motion: { kind: 'rememberedDetent', fallbackSnap: 'expanded' },
  },
  {
    from: '*',
    to: 'profile',
    transitionKind: 'topLevelSwitch',
    motion: { kind: 'rememberedDetent', fallbackSnap: 'expanded' },
  },

  // CATCH-ALL (T1 completeness): gesture / closeChild / modalClose / bootstrap / any unlisted
  // pairing → the sheet stays where it is. Future child scenes inherit these semantics until
  // given curated rows.
  { from: '*', to: '*', transitionKind: '*', motion: { kind: 'preserveLiveY' } },
];

// ─── LOOKUP ──────────────────────────────────────────────────────────────────────────────────

export type SheetMotionDescriptorQuery = {
  fromSceneKey: OverlayKey;
  toSceneKey: OverlayKey;
  transitionKind: RouteSceneSwitchSheetTransitionKind;
};

const rowMatchesQuery = (
  row: SheetMotionDescriptorRow,
  { fromSceneKey, toSceneKey, transitionKind }: SheetMotionDescriptorQuery
): boolean =>
  (row.from === '*' || row.from === fromSceneKey) &&
  (row.to === '*' || row.to === toSceneKey) &&
  (row.transitionKind === '*' || row.transitionKind === transitionKind);

const resolveRowSpecificity = (row: SheetMotionDescriptorRow): number =>
  (row.to === '*' ? 0 : 4) + (row.transitionKind === '*' ? 0 : 2) + (row.from === '*' ? 0 : 1);

const selectMostSpecificRow = (
  rows: readonly SheetMotionDescriptorRow[],
  query: SheetMotionDescriptorQuery
): SheetMotionDescriptorRow | null => {
  let best: SheetMotionDescriptorRow | null = null;
  let bestSpecificity = -1;
  for (const row of rows) {
    if (!rowMatchesQuery(row, query)) {
      continue;
    }
    const specificity = resolveRowSpecificity(row);
    if (specificity > bestSpecificity) {
      best = row;
      bestSpecificity = specificity;
    }
  }
  return best;
};

/** Mandate-tier lookup: non-null only for scenes whose sheet motion is not call-site tunable. */
export const lookupMandateSheetMotionDescriptorRow = (
  query: SheetMotionDescriptorQuery
): SheetMotionDescriptorRow | null =>
  selectMostSpecificRow(
    SHEET_MOTION_DESCRIPTOR_TABLE.filter((row) => row.tier === 'mandate'),
    query
  );

/** Default-tier lookup. The catch-all row makes this total (never null) — invariant T1. */
export const lookupDefaultSheetMotionDescriptorRow = (
  query: SheetMotionDescriptorQuery
): SheetMotionDescriptorRow => {
  const row = selectMostSpecificRow(
    SHEET_MOTION_DESCRIPTOR_TABLE.filter((row) => row.tier !== 'mandate'),
    query
  );
  // The ('*','*','*') catch-all always matches; this throw is unreachable unless the table is
  // edited to remove it (the __DEV__ init assert below catches that at boot).
  if (row == null) {
    throw new Error('[pageswitch] sheet-motion descriptor table has no catch-all row (T1)');
  }
  return row;
};

/**
 * Materialize a row's rule into the kept spring's motion-plan vocabulary.
 * 'rememberedDetent' is TRUE PER-PAGE memory (owner decision 2026-07-02): the target scene's own
 * last-settled detent (the snap-session's per-scene `sceneSheetSnaps` ledger, written on every
 * settle by the sheet-host authority's recordRouteSceneSnapFact). A remembered middle/expanded is
 * honored even when the live shared sheet sits elsewhere — Favorites left at middle comes BACK at
 * middle after visiting an expanded Profile. hidden/collapsed/unvisited are unusable for a tab
 * (they'd hide its content) → the row's fallbackSnap.
 */
export const materializeSheetMotionDescriptorRule = ({
  rule,
  toSceneKey,
  resolveSceneRememberedSnap,
}: {
  rule: SheetMotionDescriptorRule;
  toSceneKey: OverlayKey;
  resolveSceneRememberedSnap: (sceneKey: OverlayKey) => BottomSheetSnap | null;
}): RouteSceneSwitchSheetMotionPlan => {
  if (rule.kind !== 'rememberedDetent') {
    return rule;
  }
  const rememberedSnap = resolveSceneRememberedSnap(toSceneKey);
  const resolvedSnap =
    rememberedSnap === 'middle' || rememberedSnap === 'expanded'
      ? rememberedSnap
      : rule.fallbackSnap;
  return { kind: 'snapTo', snap: resolvedSnap, ...(rule.mode != null ? { mode: rule.mode } : {}) };
};

// ─── __DEV__ TABLE INVARIANTS (asserted once at module init) ─────────────────────────────────
// T1: a catch-all default row exists (every switch resolves to exactly one row).
// AMBIGUITY: within a tier, no two DISTINCT rows may overlap at equal specificity — since
// specificity is a function of which fields are exact, equal-specificity overlap ⇔ identical
// (from, to, kind) keys, which is a duplicate-row mistake.
// (`typeof __DEV__` guard: this pure module also runs under the hermetic node jest project,
// where the RN global is absent.)
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  const hasCatchAll = SHEET_MOTION_DESCRIPTOR_TABLE.some(
    (row) =>
      row.tier !== 'mandate' && row.from === '*' && row.to === '*' && row.transitionKind === '*'
  );
  if (!hasCatchAll) {
    console.error('[pageswitch] descriptor-table T1 violation: missing (*,*,*) catch-all row');
  }
  const seenRowKeys = new Set<string>();
  for (const row of SHEET_MOTION_DESCRIPTOR_TABLE) {
    const rowKey = `${row.tier ?? 'default'}|${row.from}|${row.to}|${row.transitionKind}`;
    if (seenRowKeys.has(rowKey)) {
      console.error(`[pageswitch] descriptor-table ambiguous duplicate row: ${rowKey}`);
    }
    seenRowKeys.add(rowKey);
  }
}
