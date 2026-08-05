// ─── THE SETTLE FACT (ratified item 5 / abstraction finding 5) ────────────────
//
// WHAT THIS REPLACES. The most load-bearing fact in the system — "the sheet has
// stopped" — used to be INFERRED in JS: an animated reaction sampled τ every
// frame, called it settled when two consecutive frames were within 0.5pt AND
// the posture was within 2pt of a declared detent, and suppressed re-fires with
// a one-shot on the detent it last reported. Both halves of that guard were
// holes:
//   • a rest that is NOT at a detent produced NO fact at all — the hidden
//     domain's off-screen rest, a clamped rest, a park between detents;
//   • a return to the SAME detent produced no fact either, because the one-shot
//     was never reset by a drag: drag away and back, and the episode rode the
//     700ms deadline instead of the settle it actually reached.
// The native spring knows the frame it finishes. It says so now (trackDidSettle
// — one emission per motion episode, generation-stamped), and this module is
// the pure half of consuming it: what a settle MEANS, falsifiable without a
// renderer or a device.

/** The native trackDidSettle body. `atDetent` is DATA, never a precondition —
 *  the engine reports every rest and lets policy decide what a non-detent rest
 *  is worth. */
export type TrackNativeSettleEvent = {
  /** The engine's motion-episode identity: minted at every motion START (drag
   *  begin, spring start), so a superseded episode's late fact can be told from
   *  the live one's. */
  generation: number;
  /** Resting contentOffset. */
  tau: number;
  /** Resting τ − σ: the space detents and seats are expressed in. */
  posture: number;
  atDetent: boolean;
  /** The detent this rest belongs to; null unless atDetent. */
  detentTau: number | null;
  cause: 'spring' | 'decelerate' | 'dragEnd';
  /** The rest happened with the excursion still engaged: the sheet is at rest
   *  OFF-SCREEN and the domain is holding it there. */
  hiddenEngaged: boolean;
};

/** THE STALE-FACT GUARD. The engine already emits once per episode, so this is
 *  a second line, not the first — it exists because generations are the only
 *  thing that can tell a replayed/duplicated emission (two proxies, a re-attach,
 *  a remounted listener) from a real new rest. Strictly increasing: a
 *  generation we have already consumed, or one from an older episode, is not a
 *  new fact. */
export const shouldConsumeTrackSettle = (
  lastConsumedGeneration: number,
  event: TrackNativeSettleEvent
): boolean => event.generation > lastConsumedGeneration;

export type TrackSettleReport = {
  /** Every consumed settle is a REST fact — this is what the motion authority
   *  is told, and it is unconditional. The old sampler's biggest lie was that
   *  rest and detent were the same question. */
  rest: true;
  /** The detent to write into gesture posture memory, or null. Null for a rest
   *  that is not at a detent (nothing to remember) and for a rest the user did
   *  not author (posture memory is gesture-written ONLY — inventory §5.10). */
  postureMemoryTau: number | null;
  /** The detent this rest landed on, whoever authored it — the settle
   *  observer's report to the page's onSettle. */
  detentTau: number | null;
};

/**
 * THE SETTLE VERDICT. Two orthogonal questions the sampler conflated:
 *   (1) did the sheet stop?  — the engine already answered; always yes here.
 *   (2) is this rest worth remembering? — only a DETENT rest AUTHORED BY THE
 *       FINGER becomes posture memory.
 * A rest at rest off-screen (hiddenEngaged) can never be posture memory even if
 * some detent happened to sit within tolerance: the hidden domain never writes
 * memory (R4's contract sharpening), and the outgoing entry's offset was
 * snapshotted at hide START.
 */
export const resolveTrackSettleReport = (
  event: TrackNativeSettleEvent,
  facts: { userOwnsPosture: boolean }
): TrackSettleReport => {
  const detentTau = event.atDetent && !event.hiddenEngaged ? event.detentTau : null;
  return {
    rest: true,
    detentTau,
    postureMemoryTau: facts.userOwnsPosture ? detentTau : null,
  };
};
