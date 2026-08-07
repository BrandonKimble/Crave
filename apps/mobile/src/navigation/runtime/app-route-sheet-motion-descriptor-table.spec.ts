// TOTALITY + AMBIGUITY GATE for the sheet-motion descriptor table.
//
// F6604(a) 2026-08-07: the P6 step-1 PARITY ORACLE that used to open this file
// (`legacyOracleSheetMotionPlan`, a hand-transcribed copy of the pre-table switch) is GONE.
// It presented itself as a frozen fossil while its own header instructed authors to update it
// "in the same change" on every intentional tune — three are on the record — so it was a second
// implementation maintained in lockstep with the first, and a lockstep copy cannot police the
// thing it copies. The parity claim now lives in app-route-sheet-motion-plan-parity.spec.ts as a
// frozen content DIGEST over the full 24,200-point legacy domain plus a frozen readable sample,
// neither of which can be edited in lockstep unknowingly (a change of intent must be BLESSED,
// visibly, via scripts/bless-sheet-motion-parity.sh --bless).
//
// What remains here is what this file was always uniquely for: TOTALITY over the FULL scene set
// (T1) and the no-ambiguous-duplicate-rows rule, plus the two-posture-law exhaustiveness sweep.

import type { OverlayKey } from '../../overlays/types';
import type { RouteSceneSwitchSheetTransitionKind } from './app-overlay-route-transition-contract';
import {
  findAmbiguousSheetMotionDescriptorRowKeys,
  lookupDefaultSheetMotionDescriptorRow,
  SHEET_MOTION_DESCRIPTOR_TABLE,
} from './app-route-sheet-motion-descriptor-table';
import { APP_ROOT_NAV_ITEMS } from './app-route-root-nav-items';
import {
  HOME_SEAT_CARRIER_SCENE_KEY,
  resolveNavTargetPostureSeat,
} from './app-route-sheet-snap-session-runtime';

// Exhaustiveness is COMPILE-TIME-TIED to the unions via `satisfies Record<Union, true>`:
// adding a scene key or transition kind without extending these maps is a tsc error, so the
// full-domain sweep below can never silently under-cover a new member.
const SCENE_KEY_DOMAIN = {
  search: true,
  sheetHost: true,
  polls: true,
  lists: true,
  profile: true,
  home: true,
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

describe('sheet-motion descriptor table (totality + ambiguity)', () => {
  // F6604(b): this case used to assert `expect(row).not.toBeNull()` over all 3,528
  // combinations. `lookupDefaultSheetMotionDescriptorRow` returns a NON-NULLABLE
  // SheetMotionDescriptorRow and THROWS when the catch-all is missing, so that assertion
  // was ENTAILED BY THE RETURN TYPE: the only thing that could redden the case was the
  // throw, and 3,528 iterations of a tautology carried no signal. The name also promised
  // something it never checked — EXACTLY-ONE is the duplicate-row case below, and WHICH
  // row resolved was checked nowhere.
  //
  // What totality actually claims, and what is asserted now: the lookup returns a row that
  // IS a member of the table (not a fabricated object), that is DEFAULT-tier (a mandate row
  // must never leak out of the default lookup — the tiers are the reason both lookups
  // exist), and whose rule is one the materializer can speak.
  it('T1: every (from, to, kind) resolves to a DEFAULT-tier row drawn from the table', () => {
    const RULE_KINDS = new Set([
      'none',
      'hide',
      'preserveLiveY',
      'snapTo',
      'promoteAtLeast',
      'rememberedDetent',
      'postureSeat',
    ]);
    for (const fromSceneKey of ALL_SCENE_KEYS) {
      for (const toSceneKey of ALL_SCENE_KEYS) {
        for (const transitionKind of ALL_TRANSITION_KINDS) {
          const row = lookupDefaultSheetMotionDescriptorRow({
            fromSceneKey,
            toSceneKey,
            transitionKind,
          });
          // Referential identity: the resolver hands back one of the table's own rows.
          expect(SHEET_MOTION_DESCRIPTOR_TABLE).toContain(row);
          expect(row.tier).not.toBe('mandate');
          expect(RULE_KINDS.has(row.motion.kind)).toBe(true);
        }
      }
    }
  });

  it('has no ambiguous duplicate rows within a tier', () => {
    // F1381: calls the SAME key-building/duplicate-detection the __DEV__ bark uses
    // (app-route-sheet-motion-descriptor-table.ts) instead of restating it — amending
    // the key shape can no longer leave one enforcer on the old rule.
    expect(findAmbiguousSheetMotionDescriptorRowKeys(SHEET_MOTION_DESCRIPTOR_TABLE)).toEqual([]);
  });
});

// ─── TWO-POSTURE-LAW EXHAUSTIVENESS SWEEP (root-snap-law.md §Leg 3) ─────────────────────────
// The seat resolver and the topLevelSwitch rows are DERIVED from the scene-policy registry's
// `postureSeat` field; this sweep pins the derivation against the REAL tab set: every root page
// reachable by a nav press (APP_ROOT_NAV_ITEMS + the home carrier scene) must resolve a posture
// seat and a 'postureSeat' descriptor rule. A fourth tab added without a `postureSeat`
// declaration turns this RED instead of silently opting out of the law (RED-proven in-leg by
// temporarily nulling profile's postureSeat: both expectations failed).
describe('two-posture law exhaustiveness (nav tab set vs posture seats)', () => {
  const navReachableSceneKeys: OverlayKey[] = [
    ...APP_ROOT_NAV_ITEMS.map((item) => item.key),
    HOME_SEAT_CARRIER_SCENE_KEY,
  ];

  it.each(navReachableSceneKeys)('%s resolves a posture seat', (sceneKey) => {
    expect(resolveNavTargetPostureSeat(sceneKey)).not.toBeNull();
  });

  it.each(navReachableSceneKeys)('%s topLevelSwitch resolves the postureSeat rule', (sceneKey) => {
    const row = lookupDefaultSheetMotionDescriptorRow({
      fromSceneKey: 'settings',
      toSceneKey: sceneKey,
      transitionKind: 'topLevelSwitch',
    });
    expect(row.motion.kind).toBe('postureSeat');
  });
});
