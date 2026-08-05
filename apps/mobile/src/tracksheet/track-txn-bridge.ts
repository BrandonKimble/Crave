// ─── THE TRANSACTION BRIDGE (host extraction 2) ───────────────────────────────
//
// This was ~40 lines of transition-ENGINE policy executed inside the host's
// layout effect, guarded by a 30-line comment. The comment's whole content is
// an ORDER LAW and a ROUTING RULE — both of which are now a pure function with
// a jest falsifier instead of prose a reader must trust.
//
// WHERE IT LIVES. The abstraction critique wanted this beside
// transition-transaction.ts. It lives in tracksheet/ because it is the TRACK's
// commit-side bridge INTO that engine (the engine has no track concepts, and
// the extraction's scope was the track sheet); the engine functions are
// imported, not re-implemented.
//
// WHAT STAYS IN THE EXECUTOR. Two bookends are unconditional and order-fixed
// around the plan: recordSceneChromeAck(scene) FIRST (it offers 'chrome' to the
// live txn and can itself advance it, so the txn must be read AFTER it — that
// read order is behavior, not style) and the presentation paint ack LAST.

import type { OverlayKey } from '../navigation/runtime/app-overlay-route-types';
import {
  amendTransitionTxnJoinInputs,
  getLiveTransitionTxn,
  offerTransitionJoinInput,
  sealLiveTransitionTxnJoin,
} from '../navigation/runtime/transition-engine/transition-transaction';
import { recordSceneChromeAck } from '../overlays/scene-chrome-ack-runtime';

/** The txn facts this decision reads — a snapshot, so the plan is pure. */
export type TrackTxnBridgeFacts = {
  targetSceneKey: string;
  phase: string;
  contentKind: string;
} | null;

export type TrackTxnBridgeStep = 'amend-join-inputs' | 'seal-join' | 'offer-chrome' | 'offer-paint';

export type TrackTxnBridgeInput = {
  /** The scene this commit is PRESENTING (presented truth, not active). */
  scene: string;
  liveTxn: TrackTxnBridgeFacts;
};

/**
 * THE ORDER LAW (proven by TXN-TRACE, 2026-08-01): offers made BEFORE the amend
 * are DISCARDED — an input is consumed iff the live plan declares it — and
 * recordSceneChromeAck dedupes per scene, so a revisit never re-offers. Sealing
 * was the OLD host's duty (its roles-change subscriber armed {paint, chrome} and
 * sealed); the first ack bridge ported the offers but not the seal, so every
 * track switch was un-armed and only sealed at the idle boundary — behind the
 * sheet-settle plane's 700ms fallback, landing revealed/settled (and the L4
 * flush + interactivity they gate) ~1s after paint. Hence: ARM, SEAL, then offer
 * both inputs explicitly.
 *
 * THE HIDDEN FAMILY'S ROUTING (G-HIDDEN, R4) — not a bypass: a freeze-dismiss
 * txn declares joinInputs ['boundary'] (stager) and is sealed at commit; its
 * reveal input is offered by the deferred-swap gate at the screen-edge crossing
 * (trackHiddenEdgeCleared). Amending it to {paint, chrome} here would clobber
 * that join and flip content mid-slide. The branch dies only with the
 * freezeUntilSnap plan kind itself (R8, old-system delete).
 */
export const planTrackCommitTxnBridge = ({
  scene,
  liveTxn,
}: TrackTxnBridgeInput): readonly TrackTxnBridgeStep[] => {
  if (liveTxn == null || liveTxn.targetSceneKey !== scene) {
    return [];
  }
  if (
    (liveTxn.phase === 'staged' || liveTxn.phase === 'committed') &&
    liveTxn.contentKind !== 'freezeUntilSnap'
  ) {
    return ['amend-join-inputs', 'seal-join', 'offer-chrome', 'offer-paint'];
  }
  return ['offer-paint'];
};

const TXN_BRIDGE_JOIN_INPUTS = ['paint', 'chrome'] as const;

const runStep = (step: TrackTxnBridgeStep): void => {
  switch (step) {
    case 'amend-join-inputs':
      amendTransitionTxnJoinInputs([...TXN_BRIDGE_JOIN_INPUTS]);
      return;
    case 'seal-join':
      sealLiveTransitionTxnJoin();
      return;
    case 'offer-chrome':
      offerTransitionJoinInput('chrome');
      return;
    case 'offer-paint':
      offerTransitionJoinInput('paint');
      return;
    default: {
      const exhaustive: never = step;
      void exhaustive;
    }
  }
};

/**
 * THE ACK BRIDGE (flip prerequisite, inventory §5.5): with the old host
 * unmounted, the TRACK records the chrome + paint acks that scene-switch
 * transactions join on — otherwise every switch deadlocks. Called from a layout
 * effect (ack before the paint-visible frame); stale switchIds are rejected
 * controller-side, so over-acking is harmless.
 */
export const runTrackCommitTxnBridge = ({
  scene,
  commitPaintAck,
}: {
  scene: OverlayKey;
  commitPaintAck: () => void;
}): void => {
  recordSceneChromeAck(scene);
  const liveTxn = getLiveTransitionTxn();
  const steps = planTrackCommitTxnBridge({
    scene,
    liveTxn:
      liveTxn == null
        ? null
        : {
            targetSceneKey: liveTxn.mutation.targetSceneKey,
            phase: liveTxn.phase,
            contentKind: liveTxn.plan.content.kind,
          },
  });
  for (const step of steps) {
    runStep(step);
  }
  commitPaintAck();
};
