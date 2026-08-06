// ─── THE PRESS-UP HANDOFF (touch-latency rung, 2026-08-05) ───────────────────
//
// THE MEASURED DEFECT (on device, warm polls tab switch — not re-derived here):
//
//   [PERF] switch home#root->polls#root press->paint=280ms commit->paint=119ms
//   [TXN-TRACE] committed t=733.8 … amended(pendingJoin arms) t=894.2 …
//                join:chrome 895.5 join:paint 896.0 revealed 896.4
//
// The join costs ~2ms. The ~160ms between the route txn COMMITTING and the
// host's ack bridge ARMING is React rendering the destination's tree before the
// layout effect runs — i.e. the finger paid the destination's first-screenful
// render cost. The probe said polls "presented real rows in the switch commit",
// so the skeleton path never engaged: readiness said READY, and the switch
// commit was blocked on rendering rows anyway.
//
// THE RE-DERIVATION. The readiness axis (track-entry-readiness.ts) answers
// "does a concrete body RESOLUTION exist" — a DATA question, and the right one
// for OA6.1's frozen world. The owner's question is a different one: "can this
// paint THIS frame?" Those are not the same axis, and conflating them is what
// let a data-warm entry cost 119ms of finger time. So this module states the
// SECOND fact the track never had:
//
//   AN ENTRY'S BODY IS CHEAP TO PAINT ONLY IF ITS VIEWS ARE ALREADY MOUNTED.
//
// On the one-track page (TrackSheetPage renders exactly ONE FlashList, fed by
// the PRESENTED leg only — that is the whole reason posture is unambiguous)
// paint residency belongs to exactly one entry at a time: the outgoing one.
// Therefore the destination of ANY switch has, by construction, zero mounted
// rows, and "the switch commit renders the destination's rows" is a promise the
// page cannot keep in one frame. The flip must not be BLOCKED on it.
//
// THE HANDOFF, then: the press-up commit paints the destination's CHROME (its
// layer is already mounted and opacity-flipped — O(1)) over a body the page can
// produce WITHOUT the destination's live resolution — its frozen last-good body
// if it has one, the skeleton if it never has; the real body lands in the next
// commit, released at the paint boundary. That is the two-phase cold flip the
// contract already ratified (R2), applied by the fact that actually governs it
// — are this entry's rows MOUNTED — instead of by whether its data happened to
// have arrived, or by whether it once painted (see the correction below).
//
// RESIDENCY, NOT HISTORY (correction 2026-08-05, audit defect 1). The first cut
// of this module exempted an entry that had EVER painted ("entryHasPaintedContent").
// That is precisely the repeat tab-switch the 280ms measurement came from: the
// second visit to polls is has-ever-painted, took 'direct', and blocked the flip
// frame on the destination's first screenful all over again. The rung fixed the
// case nobody complained about and left the measured one untouched.
//
// The true fact behind the exemption is not "has ever painted" but "IS STILL
// MOUNTED" — cheap-to-paint is a statement about the CURRENT view tree, and a
// view tree that unmounted two switches ago is exactly as expensive as one that
// never existed. So the ledger below is a RESIDENCY fact with a single slot:
// TrackSheetPage renders ONE FlashList fed by the PRESENTED leg, therefore at
// most one entry's rows are mounted at any instant, and it is always the
// outgoing one. Written when the presented leg builds its real body; cleared at
// the flip, because that is the commit the outgoing rows leave the tree.
//
// The consequence is the intended one: the destination of ANY switch is
// non-resident, so EVERY switch defers — first visit and revisit alike.
//
// AND OA6.1 SURVIVES ANYWAY, without an exemption. The deferred frame is not
// obliged to paint a skeleton; it is obliged to paint something the page can
// produce without the destination's live resolution. For an entry that has shown
// content that something is its FROZEN last-good body (lastGoodListRef, the
// readiness ledger's existing 'frozen' phase) — so a revisit shows content in
// the flip frame and the destination's CURRENT resolution is still not rendered
// in the finger's frame. Skeleton remains what it always was: the body of an
// entry that has never had one.
//
// THE HONEST RESIDUAL (owed to device measurement, not claimed here): when an
// entry's frozen body and its current resolution are the SAME list, the flip
// frame pays the same render it would have paid without the rung. What the rung
// removes in that case is the destination's *live* first-screenful — measurable
// by the cost instrument, and the falsifier is written against exactly that and
// nothing more.
//
// RN-free on purpose (pure jest lane).

import type { TrackEntryKey } from './track-entry-identity';

export type TrackEntryHandoffDecision =
  /** Paint the destination's real body in the switch commit (this frame). */
  | 'direct'
  /** Paint the skeleton in the switch commit; the real body is the next one. */
  | 'defer';

export type TrackEntryHandoffFacts = {
  /**
   * The destination's resolution carries real rows this commit
   * (resolutionHasRealRows). FALSE means readiness is already painting a
   * skeleton (cold) or the frozen last-good body (OA6.1) for its own reason —
   * there is nothing to hand off, and arming here would be a second mechanism
   * making the same decision.
   */
  destinationHasRealRows: boolean;
  /**
   * This entry's real rows are STILL MOUNTED right now (TrackEntryResidencyLedger).
   * On the one-track page this is only ever true of the OUTGOING entry, so it is
   * false for the destination of every switch — which is the point: the fact is
   * stated rather than assumed, so the day the page mounts more than one body the
   * decision follows the physics instead of a comment.
   */
  destinationRowsAreResident: boolean;
  /**
   * The destination scene is in the world-join family (OA1: search / results /
   * listDetail). Their reveal is joined on {map items ready, cards ready} — the
   * ONE choreography beyond the uniform switch a scene may declare — and it
   * owns its own skeleton/content decision. A handoff here would insert a
   * second, rival phase between the join's legs.
   */
  participatesInWorldJoin: boolean;
  /**
   * There IS an outgoing painted page. A handoff hands off FROM something; the
   * first presentation of the session (boot, the sheet appearing) has no
   * outgoing paint to protect, so there is no finger waiting on a flip.
   */
  hasOutgoingPaint: boolean;
};

/**
 * THE DECISION, total and pure. Ordered so that each 'direct' is a STATED
 * reason, never a fallthrough:
 *
 *   no outgoing paint      → direct (nothing to hand off from)
 *   no real rows           → direct (readiness already paints skeleton/frozen)
 *   world-join scene       → direct (OA1 owns the reveal)
 *   rows already resident  → direct (the body is mounted: the frame IS free)
 *   otherwise              → defer  (the finger must not pay this render)
 */
export const planTrackEntryHandoff = ({
  destinationHasRealRows,
  destinationRowsAreResident,
  participatesInWorldJoin,
  hasOutgoingPaint,
}: TrackEntryHandoffFacts): TrackEntryHandoffDecision => {
  if (!hasOutgoingPaint) {
    return 'direct';
  }
  if (!destinationHasRealRows) {
    return 'direct';
  }
  if (participatesInWorldJoin) {
    return 'direct';
  }
  if (destinationRowsAreResident) {
    return 'direct';
  }
  return 'defer';
};

/**
 * WHOSE ROWS ARE MOUNTED RIGHT NOW. One slot, because the page has one body:
 * TrackSheetPage feeds its single FlashList from the PRESENTED leg only, so
 * marking a new resident is the same event as the previous one leaving the tree.
 *
 * Written at exactly one place — the commit that builds an entry's real body FOR
 * PRESENTATION — and cleared at the flip, where the outgoing rows unmount. It
 * cannot drift into meaning "data arrived" (the readiness ledger's job) nor
 * "has ever painted" (the fact this replaced, which was wrong).
 */
export class TrackEntryResidencyLedger {
  private resident: TrackEntryKey | null = null;

  /** This entry's real body is the one mounted on the page. Exclusive by
   * construction — there is only one body to be. */
  markResident(entryKey: TrackEntryKey): void {
    this.resident = entryKey;
  }

  isResident(entryKey: TrackEntryKey): boolean {
    return this.resident === entryKey;
  }

  /** The flip: the outgoing body leaves the tree, so nothing is resident until
   * some leg builds its real body again in this same commit. */
  clear(): void {
    this.resident = null;
  }

  /** Eviction hygiene, same law as the readiness latch: an evicted child entry
   * id never returns (a re-push mints a new one). */
  forget(entryKey: TrackEntryKey): void {
    if (this.resident === entryKey) {
      this.resident = null;
    }
  }
}
