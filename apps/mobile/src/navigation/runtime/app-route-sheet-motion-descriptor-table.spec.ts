// P6 STEP-1 PARITY GATE (page-switch-master-plan.md §6-P6): the sheet-motion descriptor table
// must resolve the SAME motion plan as the old inline per-transitionKind switch for EVERY
// (source, target, transitionKind, currentSnap, explicitSnapTarget) combination — step 1 is a
// pure relocation of the snap decision into config, zero behavior change.
//
// The oracle below (legacyOracleSheetMotionPlan) is a frozen copy of the pre-table EFFECTIVE
// flow behavior: resolveDefaultSheetMotionPlan's switch (app-route-scene-transition-policy-
// runtime.ts, pre-P6) PLUS the one call-site override the relocation folded into the table (the
// pollCreation revealRoute mode:'instant' — see the inline note on that branch). It is NOT a
// byte-copy of the old switch alone. It exists ONLY as the parity oracle. WHEN THE OWNER
// INTENTIONALLY TUNES A ROW (the whole point of req 2d), update the matching oracle branch here
// in the same change — this spec pins ACCIDENTAL divergence, not the table's freedom to evolve.
//
// INTENTIONAL TUNE 2026-07-02 (owner decision): 'rememberedDetent' upgraded from live-shared
// detent (preserveLiveY when the shared sheet sat usable) to TRUE PER-PAGE memory — snapTo the
// TARGET scene's own remembered detent when usable (middle/expanded), else the fallback. The
// oracle's bookmarks/profile branch and the sweep's snap dimension were updated in-change.

import type { BottomSheetSnap } from '../../overlays/bottomSheetMotionTypes';
import type { OverlayKey } from '../../overlays/types';
import type {
  RouteSceneSwitchSheetMotionPlan,
  RouteSceneSwitchSheetTransitionKind,
} from './app-overlay-route-transition-contract';
import { resolveDefaultSheetMotionPlan } from './app-route-scene-transition-policy-runtime';
import {
  lookupDefaultSheetMotionDescriptorRow,
  SHEET_MOTION_DESCRIPTOR_TABLE,
} from './app-route-sheet-motion-descriptor-table';

// Exhaustiveness is COMPILE-TIME-TIED to the unions via `satisfies Record<Union, true>`:
// adding a scene key or transition kind without extending these maps is a tsc error, so the
// full-domain sweep below can never silently under-cover a new member.
const SCENE_KEY_DOMAIN = {
  search: true,
  sheetHost: true,
  polls: true,
  bookmarks: true,
  profile: true,
  restaurant: true,
  saveList: true,
  price: true,
  scoreInfo: true,
  pollCreation: true,
  pollDetail: true,
  userProfile: true,
  listDetail: true,
  followList: true,
  notifications: true,
  settings: true,
  editProfile: true,
  postPhotos: true,
  messagesInbox: true,
  dmSession: true,
} satisfies Record<OverlayKey, true>;

const ALL_SCENE_KEYS = Object.keys(SCENE_KEY_DOMAIN) as readonly OverlayKey[];

// The parity oracle below is a byte-frozen fossil of the PRE-TABLE switch. Scene keys added
// AFTER the table migration (the 7 stub scenes, 2026-07) have deliberate table rows the oracle
// never knew about — parity is only meaningful over the legacy domain. Totality tests (T1,
// duplicate-rows) still sweep the FULL domain.
const LEGACY_SCENE_KEYS: readonly OverlayKey[] = [
  'search',
  'sheetHost',
  'polls',
  'bookmarks',
  'profile',
  'restaurant',
  'saveList',
  'price',
  'scoreInfo',
  'pollCreation',
  'pollDetail',
];

const TRANSITION_KIND_DOMAIN = {
  bootstrap: true,
  topLevelSwitch: true,
  openChild: true,
  closeChild: true,
  terminalDismiss: true,
  gesture: true,
  modalOpen: true,
  modalClose: true,
} satisfies Record<RouteSceneSwitchSheetTransitionKind, true>;

const ALL_TRANSITION_KINDS = Object.keys(
  TRANSITION_KIND_DOMAIN
) as readonly RouteSceneSwitchSheetTransitionKind[];

// The TARGET scene's remembered detent (the per-scene snap-session ledger read).
const ALL_REMEMBERED_SNAPS: readonly (BottomSheetSnap | null)[] = [
  null,
  'collapsed',
  'middle',
  'expanded',
  'hidden',
];

const ALL_EXPLICIT_SNAPS: readonly (BottomSheetSnap | null)[] = [
  null,
  'collapsed',
  'middle',
  'expanded',
  'hidden',
];

const MODAL_SCENES = new Set<OverlayKey>(['price', 'scoreInfo']);

// ─── the byte-frozen pre-table switch (see header) ──────────────────────────────────────────
const legacyOracleSheetMotionPlan = ({
  sourceSceneKey,
  targetSceneKey,
  transitionKind,
  explicitSnapTarget,
  rememberedSceneSnap,
}: {
  sourceSceneKey: OverlayKey;
  targetSceneKey: OverlayKey;
  transitionKind: RouteSceneSwitchSheetTransitionKind;
  explicitSnapTarget: BottomSheetSnap | null;
  rememberedSceneSnap: BottomSheetSnap | null;
}): RouteSceneSwitchSheetMotionPlan => {
  if (MODAL_SCENES.has(targetSceneKey)) {
    return { kind: 'none' };
  }
  if (explicitSnapTarget != null) {
    return explicitSnapTarget === 'hidden'
      ? { kind: 'hide' }
      : { kind: 'snapTo', snap: explicitSnapTarget };
  }
  switch (transitionKind) {
    case 'terminalDismiss':
      return { kind: 'hide' };
    case 'openChild':
      // pollCreation: the pre-table DEFAULT switch said {snapTo, expanded}, but the only real
      // pollCreation open (revealRoute) carried an EXPLICIT mode:'instant' override at the call
      // site. P6 step 1 deleted that redundant override and folded mode:'instant' into the row,
      // so the oracle pins the pre-change EFFECTIVE flow behavior (instant expanded cover).
      if (targetSceneKey === 'pollCreation') {
        return { kind: 'snapTo', snap: 'expanded', mode: 'instant' };
      }
      if (targetSceneKey === 'saveList' || targetSceneKey === 'pollDetail') {
        return { kind: 'snapTo', snap: 'expanded' };
      }
      if (targetSceneKey === 'restaurant') {
        return { kind: 'promoteAtLeast', snap: 'middle' };
      }
      return { kind: 'preserveLiveY' };
    case 'closeChild':
      // 2026-07-10 owner tune: pollDetail dismiss glides back to the PARENT's remembered
      // detent (origin-faithful) instead of leaving the feed at the detail's expanded Y.
      if (sourceSceneKey === 'pollDetail') {
        return rememberedSceneSnap === 'middle' || rememberedSceneSnap === 'expanded'
          ? { kind: 'snapTo', snap: rememberedSceneSnap }
          : { kind: 'snapTo', snap: 'middle' };
      }
      return { kind: 'preserveLiveY' };
    case 'topLevelSwitch':
      if (targetSceneKey === 'search' || targetSceneKey === 'polls') {
        return { kind: 'snapTo', snap: 'collapsed' };
      }
      if (targetSceneKey === 'bookmarks' || targetSceneKey === 'profile') {
        // 2026-07-02 intentional tune: TRUE per-page memory (see header).
        return rememberedSceneSnap === 'middle' || rememberedSceneSnap === 'expanded'
          ? { kind: 'snapTo', snap: rememberedSceneSnap }
          : { kind: 'snapTo', snap: 'expanded' };
      }
      return { kind: 'preserveLiveY' };
    case 'gesture':
    case 'modalClose':
    case 'bootstrap':
    default:
      return { kind: 'preserveLiveY' };
  }
};

describe('sheet-motion descriptor table (P6 step 1)', () => {
  it('resolves byte-identically to the pre-table switch over the LEGACY input domain', () => {
    const mismatches: string[] = [];
    let combos = 0;
    for (const sourceSceneKey of LEGACY_SCENE_KEYS) {
      for (const targetSceneKey of LEGACY_SCENE_KEYS) {
        for (const transitionKind of ALL_TRANSITION_KINDS) {
          for (const rememberedSceneSnap of ALL_REMEMBERED_SNAPS) {
            for (const explicitSnapTarget of ALL_EXPLICIT_SNAPS) {
              combos += 1;
              const tablePlan = resolveDefaultSheetMotionPlan({
                sourceSceneKey,
                targetSceneKey,
                transitionKind,
                explicitSnapTarget,
                resolveSceneRememberedSnap: () => rememberedSceneSnap,
              });
              const legacyPlan = legacyOracleSheetMotionPlan({
                sourceSceneKey,
                targetSceneKey,
                transitionKind,
                explicitSnapTarget,
                rememberedSceneSnap,
              });
              if (JSON.stringify(tablePlan) !== JSON.stringify(legacyPlan)) {
                mismatches.push(
                  `${sourceSceneKey}->${targetSceneKey} kind=${transitionKind} ` +
                    `remembered=${rememberedSceneSnap} explicit=${explicitSnapTarget}: ` +
                    `table=${JSON.stringify(tablePlan)} legacy=${JSON.stringify(legacyPlan)}`
                );
              }
            }
          }
        }
      }
    }
    expect(combos).toBe(
      LEGACY_SCENE_KEYS.length ** 2 *
        ALL_TRANSITION_KINDS.length *
        ALL_REMEMBERED_SNAPS.length *
        ALL_EXPLICIT_SNAPS.length
    );
    expect(mismatches).toEqual([]);
  });

  it('T1: every (from, to, kind) resolves to exactly one default row', () => {
    for (const fromSceneKey of ALL_SCENE_KEYS) {
      for (const toSceneKey of ALL_SCENE_KEYS) {
        for (const transitionKind of ALL_TRANSITION_KINDS) {
          const row = lookupDefaultSheetMotionDescriptorRow({
            fromSceneKey,
            toSceneKey,
            transitionKind,
          });
          expect(row).not.toBeNull();
        }
      }
    }
  });

  it('has no ambiguous duplicate rows within a tier', () => {
    const seen = new Set<string>();
    for (const row of SHEET_MOTION_DESCRIPTOR_TABLE) {
      const key = `${row.tier ?? 'default'}|${row.from}|${row.to}|${row.transitionKind}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
