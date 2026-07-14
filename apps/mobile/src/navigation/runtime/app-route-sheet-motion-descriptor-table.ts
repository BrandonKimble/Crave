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
// OWNER DEFAULTS ENCODED (two-posture law ratified 2026-07-12, plans/root-snap-law.md §Leg 2;
// supersedes the 2026-07-01 map-first rows and the 2026-07-02 per-tab memory rows):
//   • Nav switches (topLevelSwitch) = the TWO-POSTURE SEATS ('postureSeat'): home (search/polls)
//     and content (every other root page, ONE shared posture) each remember wherever the user's
//     FINGER last put the sheet — collapsed included. Switching tabs never moves the sheet
//     except when crossing between home and the rest; cold-start seeds: home collapsed,
//     content expanded. Seat memory is gesture-written only (snap-session write contract).
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
import {
  CONTENT_SEAT_SEED_SNAP,
  HOME_SEAT_CARRIER_SCENE_KEY,
  HOME_SEAT_SEED_SNAP,
  resolveNavTargetPostureSeat,
} from './app-route-sheet-snap-session-runtime';
import { APP_ROUTE_SCENE_KEYS } from './app-route-scene-policy-registry';

export type SheetMotionDescriptorScene = OverlayKey | '*';
export type SheetMotionDescriptorKind = RouteSceneSwitchSheetTransitionKind | '*';

/**
 * A row's motion rule. The static variants ARE the existing RouteSceneSwitchSheetMotionPlan
 * shapes (snapTo / promoteAtLeast / preserveLiveY / hide / none — the kept spring's vocabulary).
 * Two derived rules:
 *  - 'rememberedDetent' (child DISMISS restores): snap to the TARGET scene's own remembered
 *    detent when usable (middle/expanded — a collapsed parent memory would hide the content
 *    the child was opened from), else `fallbackSnap`.
 *  - 'postureSeat' (THE two-posture law, owner 2026-07-12): every nav-page switch snaps to the
 *    TARGET side's posture seat — home (search/polls → the docked-polls seat) or content (one
 *    shared seat for every other root page). Same-side switches resolve to the detent the live
 *    sheet already sits at (zero motion — content pages swap in place); home↔content crossings
 *    restore the other side's remembered posture, collapsed included (it is a first-class home
 *    posture). An unusable seat (hidden = dismissed docked polls, or unset) falls to the side's
 *    cold-start seed: home 'collapsed', content 'expanded'. Zero per-row config by design.
 */
export type SheetMotionDescriptorRule =
  | RouteSceneSwitchSheetMotionPlan
  | {
      kind: 'rememberedDetent';
      fallbackSnap: Exclude<BottomSheetSnap, 'hidden'>;
      mode?: BottomSheetMotionCommand['mode'];
    }
  | { kind: 'postureSeat' };

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
  // listDetail is a WORLD-backed child (leg 10 step 2, owner decree): opening a list
  // reveals its map world, so the sheet sits at MIDDLE — an expanded sheet DROPS to
  // middle (snapTo is absolute; promoteAtLeast could never demote), a collapsed one
  // rises. The step-2 fitAll camera fits the members above this mid-snap line.
  {
    from: '*',
    to: 'listDetail',
    transitionKind: 'openChild',
    motion: { kind: 'snapTo', snap: 'middle' },
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
  // W2 (page-registry §7.4): the post page opens at expanded like every full-page child.
  {
    from: '*',
    to: 'postPhotos',
    transitionKind: 'openChild',
    motion: { kind: 'snapTo', snap: 'expanded' },
  },
  // W3 messaging (§4.1/§7.9): inbox + DM thread open fully extended; back
  // restores the prior snap via the generic child-dismiss remembered detent.
  {
    from: '*',
    to: 'messagesInbox',
    transitionKind: 'openChild',
    motion: { kind: 'snapTo', snap: 'expanded' },
  },
  {
    from: '*',
    to: 'dmSession',
    transitionKind: 'openChild',
    motion: { kind: 'snapTo', snap: 'expanded' },
  },

  // CHILD DISMISS (owner decision 2026-07-10): backing out of a poll detail GLIDES the
  // sheet back to the PARENT's own remembered detent — the feed left at middle comes back
  // at middle (origin-faithful, symmetric with the rest of the nav). The old preserveLiveY
  // left the feed inheriting the detail's expanded posture. fallback middle: card taps
  // can't originate from a collapsed feed, so a collapsed/unvisited ledger entry only means
  // the fact is unusable — middle is the card-visible posture.
  {
    from: 'pollDetail',
    to: '*',
    transitionKind: 'closeChild',
    motion: { kind: 'rememberedDetent', fallbackSnap: 'middle' },
  },
  // listDetail closeChild (wave-3 §2.6, owner): listDetail is the child that MOVES the sheet on
  // open (snapTo middle for its map world), so the catch-all preserveLiveY strands the return —
  // exiting a list landed on Lists home with the sheet still down, a return-to-origin violation.
  // Glide back to the parent's own remembered detent (same rule as pollDetail/settings; the
  // origin-restore seam pre-writes the popped-to scene's captured posture, so this reads the
  // exact origin). fallback expanded: list taps require a raised sheet, so an unusable memory
  // only means the fact is missing — expanded is the content side's seed posture.
  {
    from: 'listDetail',
    to: '*',
    transitionKind: 'closeChild',
    motion: { kind: 'rememberedDetent', fallbackSnap: 'expanded' },
  },
  // settings closeChild: settings is the FULL-SNAP exception (its shell pins every live snap to
  // the safe-area top), so the catch-all preserveLiveY would strand the parent at the settings
  // top. Glide back to the parent's own remembered detent (origin-faithful, same rule as
  // pollDetail). fallback expanded: settings only opens from the profile header, which is
  // visible at any detent, and an unusable remembered snap means the parent posture is unknown —
  // expanded matches the profile tab's own topLevelSwitch fallback.
  {
    from: 'settings',
    to: '*',
    transitionKind: 'closeChild',
    motion: { kind: 'rememberedDetent', fallbackSnap: 'expanded' },
  },
  // ── OWNER TUNING EXAMPLE (req 2d): to change the poll-card → poll-detail movement pattern,
  // edit the two pollDetail rows above — nothing else. E.g. "open only to middle, dismiss by
  // dropping the sheet to collapsed" would be:
  //   { from: '*', to: 'pollDetail', transitionKind: 'openChild',
  //     motion: { kind: 'snapTo', snap: 'middle' } },
  //   { from: 'pollDetail', to: '*', transitionKind: 'closeChild',
  //     motion: { kind: 'snapTo', snap: 'collapsed' } },
  // (replacing the current pair). The engine, the spring, and every other flow are untouched.

  // NAV-PAGE SWITCHES (topLevelSwitch) — THE TWO-POSTURE LAW (owner 2026-07-12). Every root
  // page resolves to its side's posture seat; the boundary behavior (content pages never move
  // the sheet between each other, home↔content crossings restore each side's memory) is
  // DERIVED inside the one 'postureSeat' rule, not hand-written per transition. This replaced
  // the 2026-07-01 `snapTo collapsed` map-first rows (the home-posture-loss bug) and the
  // 2026-07-02 per-tab rememberedDetent rows (owner-ratified deletion: tabs now share ONE seat).
  // The rows themselves are DERIVED from the scene-policy registry's exhaustive `postureSeat`
  // field (root-snap-law.md §Leg 3): a new root page declared there gets its row by
  // construction — no hand-maintained target list to forget (today: search/polls/bookmarks/
  // profile).
  ...APP_ROUTE_SCENE_KEYS.filter((sceneKey) => resolveNavTargetPostureSeat(sceneKey) != null).map(
    (sceneKey): SheetMotionDescriptorRow => ({
      from: '*',
      to: sceneKey,
      transitionKind: 'topLevelSwitch',
      motion: { kind: 'postureSeat' },
    })
  ),

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
 *
 * 'rememberedDetent' (child dismiss restores — pollDetail/settings closeChild): the target
 * scene's own last-settled detent when usable (middle/expanded — a collapsed memory would hide
 * the content the child was opened from), else the row's fallbackSnap.
 *
 * 'postureSeat' (two-posture law): snap to the TARGET side's seat. The seat read goes through
 * resolveSceneRememberedSnap, whose snap-session backing routes polls → the HOME seat and
 * bookmarks/profile → the ONE content seat ('search' as a nav target IS home — the docked-polls
 * presentation — so it aliases to the polls seat here). Collapsed is a first-class remembered
 * posture; only hidden (dismissed docked polls) / unset fall to the side's cold-start seed —
 * which for home is also the sanctioned docked-polls resurrect posture.
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
  if (rule.kind === 'postureSeat') {
    const isHomeSide = resolveNavTargetPostureSeat(toSceneKey) === 'home';
    const seatSnap = resolveSceneRememberedSnap(
      isHomeSide ? HOME_SEAT_CARRIER_SCENE_KEY : toSceneKey
    );
    const resolvedSnap =
      seatSnap === 'collapsed' || seatSnap === 'middle' || seatSnap === 'expanded'
        ? seatSnap
        : isHomeSide
          ? HOME_SEAT_SEED_SNAP
          : CONTENT_SEAT_SEED_SNAP;
    return { kind: 'snapTo', snap: resolvedSnap };
  }
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
