import type { OverlayKey } from '../navigation/runtime/app-overlay-route-types';
import { offerTransitionJoinInput } from '../navigation/runtime/transition-engine/transition-transaction';

// ─── THE CHROME-ACK (child-transition primitive §2.3, leg 6) ─────────────────────────────────
//
// The joined reveal (T5 — engine-owned): the header host records its post-commit ack here,
// which OFFERS 'chrome' to the live TransitionTxn; the txn joins it with 'paint' and its
// 'revealed' edge is the one visible-commit. This kills the nav-page one-beat header/strip
// lag (content opacity can never lead the header paint). The old host-side
// joinSceneChromeAck ceremony (34ms watchdog) was deleted with the inversion — the ENGINE
// owns the liveness degrade now (join_liveness_degrade in transition-transaction.ts).
//
// Module-scope store (the house live-state pattern). TWO writers share this single global
// slot: PersistentSheetHeaderHost (post-commit, useLayoutEffect on its sceneKey) and
// tracksheet/TrackSheetRouteHost. Both dedupe against the SAME `chromeAckSceneKey`, so two
// hosts alternating scene keys can each defeat the other's dedupe and re-offer 'chrome'
// (F1457(b)) — a real question, unverified: needs a device/rig repro of the alternating-writer
// case, not settled by reading the code, so it is left OPEN rather than "fixed" here.

let chromeAckSceneKey: OverlayKey | null = null;

/** Post-commit ack. TWO writers share this slot — see the module comment above (F1457(b)). */
export const recordSceneChromeAck = (sceneKey: OverlayKey): void => {
  if (chromeAckSceneKey === sceneKey) {
    return;
  }
  chromeAckSceneKey = sceneKey;
  // §Q redo T1b: the chrome source OFFERS its input to the live transaction
  // (consumed iff the txn's plan declared 'chrome').
  offerTransitionJoinInput('chrome');
};

/** Test seam (jest): reset the module store between cases. */
export const __resetSceneChromeAckForTest = (): void => {
  chromeAckSceneKey = null;
};

// THE MEASURED-CHROME HEIGHT CACHE IS DEAD (THE PAGE L1, 2026-07-16). Chrome height is
// a pure computed fact now — computeSceneChromeHeight (scene-chrome-geometry.ts) — so
// the per-scene measurement map, the same-composition-signature guess, and the retained
// shared fallback are unrepresentable. onLayout survives ONLY as the dev-time
// computed-vs-measured bark in PersistentSheetHeaderHost (the RED instrument).
