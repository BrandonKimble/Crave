// F6604(a) / D112 — THE PARITY ORACLE'S REPLACEMENT: a frozen DIGEST plus a frozen readable
// SAMPLE, in place of the hand-transcribed `legacyOracleSheetMotionPlan` second implementation.
//
// WHY THE ORACLE DIED. The old spec re-derived the pre-table switch as a parallel program and
// compared the two. Its own header instructed authors to edit BOTH sides "in the same change"
// on every intentional tune (three of them are on the record), so its power to catch an
// accidental divergence rested entirely on an author forgetting to do the thing the workflow
// prescribed. A second copy of a decision, maintained in lockstep, is not an oracle.
//
// WHY NOT A FULL FROZEN GOLDEN. Measured: the parity domain is 11 legacy scenes squared x 8
// transition kinds x 5 remembered snaps x 5 explicit snaps = 24,200 rows, 1.78MB. A ~1.9MB
// committed fixture is not worth its weight, and every shrink that drops "dimensions the plan
// does not depend on" re-derives the implementation — the exact disease being cured.
//
// WHAT IS FROZEN INSTEAD (app-route-sheet-motion-plan-parity-frozen.ts):
//   1. FROZEN_SHEET_MOTION_PARITY_DIGEST — a content hash of the COMPLETE derivation over the
//      full domain, in a canonical order. Any one of the 24,200 rows drifting changes it.
//      Nothing is re-derived by hand, so nothing can be "updated in-change" without noticing.
//   2. FROZEN_SHEET_MOTION_PARITY_SAMPLE — a small human-readable slice, one key per DISTINCT
//      plan value (7 today), asserted verbatim. The digest says THAT something moved; the
//      sample says WHAT it looks like now, so a red digest is debuggable.
// Both are regenerated ONLY by `scripts/bless-sheet-motion-parity.sh --bless`, which prints the
// old and the new digest. A bless is a visible act with a diff, never a side effect of a run.

import type { BottomSheetSnap } from '../../overlays/bottomSheetMotionTypes';
import type { OverlayKey } from '../../overlays/types';
import type { RouteSceneSwitchSheetTransitionKind } from './app-overlay-route-transition-contract';
import { resolveDefaultSheetMotionPlan } from './app-route-scene-transition-policy-runtime';

/**
 * The LEGACY domain: the scene keys that existed when the descriptor table replaced the inline
 * switch. Scene keys added after the migration (the 2026-07 stub scenes) have deliberate table
 * rows the pre-table switch never knew about, so parity is only meaningful over these. Totality
 * over the FULL scene set is the T1 case's job, not this one's.
 */
export const LEGACY_PARITY_SCENE_KEYS: readonly OverlayKey[] = [
  'search',
  'sheetHost',
  'polls',
  'lists',
  'profile',
  'restaurant',
  'saveList',
  'price',
  'scoreInfo',
  'pollCreation',
  'pollDetail',
];

export const PARITY_TRANSITION_KINDS: readonly RouteSceneSwitchSheetTransitionKind[] = [
  'bootstrap',
  'topLevelSwitch',
  'openChild',
  'closeChild',
  'terminalDismiss',
  'gesture',
  'modalOpen',
  'modalClose',
];

export const PARITY_SNAPS: readonly (BottomSheetSnap | null)[] = [
  null,
  'collapsed',
  'middle',
  'expanded',
  'hidden',
];

/** Canonical, stable key for one point of the domain. Iteration order is the nesting below. */
const parityKey = (params: {
  sourceSceneKey: OverlayKey;
  targetSceneKey: OverlayKey;
  transitionKind: RouteSceneSwitchSheetTransitionKind;
  rememberedSceneSnap: BottomSheetSnap | null;
  explicitSnapTarget: BottomSheetSnap | null;
}): string =>
  `${params.sourceSceneKey}>${params.targetSceneKey}|${params.transitionKind}` +
  `|remembered=${params.rememberedSceneSnap ?? 'null'}` +
  `|explicit=${params.explicitSnapTarget ?? 'null'}`;

export interface SheetMotionParityLine {
  key: string;
  plan: string;
}

/**
 * The FULL derivation, from the REAL resolver, in canonical order. Deterministic: no clock, no
 * randomness, no environment — the same inputs produce the same 24,200 lines every run.
 */
export const deriveSheetMotionParityLines = (): SheetMotionParityLine[] => {
  const lines: SheetMotionParityLine[] = [];
  for (const sourceSceneKey of LEGACY_PARITY_SCENE_KEYS) {
    for (const targetSceneKey of LEGACY_PARITY_SCENE_KEYS) {
      for (const transitionKind of PARITY_TRANSITION_KINDS) {
        for (const rememberedSceneSnap of PARITY_SNAPS) {
          for (const explicitSnapTarget of PARITY_SNAPS) {
            const plan = resolveDefaultSheetMotionPlan({
              sourceSceneKey,
              targetSceneKey,
              transitionKind,
              explicitSnapTarget,
              resolveSceneRememberedSnap: () => rememberedSceneSnap,
            });
            lines.push({
              key: parityKey({
                sourceSceneKey,
                targetSceneKey,
                transitionKind,
                rememberedSceneSnap,
                explicitSnapTarget,
              }),
              plan: JSON.stringify(plan),
            });
          }
        }
      }
    }
  }
  return lines;
};

/**
 * Content hash of the complete derivation. FNV-1a 64-bit, run over the serialized stream in two
 * independently-seeded lanes and printed as 32 hex chars — a pure-TS hash, so the digest is
 * identical under jest, under node, and in CI with no crypto/polyfill surface in the way. It is
 * a DRIFT detector, not a security primitive: the adversary is a forgotten edit, not a forger.
 */
export const hashSheetMotionParityLines = (lines: readonly SheetMotionParityLine[]): string => {
  const PRIME = BigInt('0x100000001b3');
  const MASK = BigInt('0xffffffffffffffff');
  let a = BigInt('0xcbf29ce484222325');
  let b = BigInt('0x84222325cbf29ce4');
  for (const line of lines) {
    const chunk = `${line.key}\t${line.plan}\n`;
    for (let index = 0; index < chunk.length; index += 1) {
      const code = BigInt(chunk.charCodeAt(index));
      a = ((a ^ code) * PRIME) & MASK;
      b = ((b ^ ((code + BigInt(index)) & BigInt(0xffff))) * PRIME) & MASK;
    }
  }
  return `${a.toString(16).padStart(16, '0')}${b.toString(16).padStart(16, '0')}`;
};

export const computeSheetMotionParityDigest = (): string =>
  hashSheetMotionParityLines(deriveSheetMotionParityLines());

/**
 * The readable slice: the FIRST key (canonical order) that produces each DISTINCT plan value.
 * Selection is deterministic and coverage-driven — every distinct plan the table can emit over
 * the parity domain appears exactly once, so a change to any plan SHAPE lands here in words.
 */
export const deriveSheetMotionParitySample = (
  lines: readonly SheetMotionParityLine[] = deriveSheetMotionParityLines()
): Record<string, string> => {
  const sample: Record<string, string> = {};
  const seenPlans = new Set<string>();
  for (const line of lines) {
    if (seenPlans.has(line.plan)) {
      continue;
    }
    seenPlans.add(line.plan);
    sample[line.key] = line.plan;
  }
  return sample;
};
