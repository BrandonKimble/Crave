// ─── THE ONE PAINT RESOLVER (R8, owner-approved — OA8) ───────────────────────
//
// Before this module the track had TWO independent skeleton deciders — the
// readiness ledger's `present()` (content | skeleton | frozen) and the
// press-up handoff's inline frozen/skeleton branch in use-track-leg-resolver —
// each holding half of "what body does this leg paint this commit". The
// contract recorded the debt twice: the displaced "one paint resolver"
// shortlist item (CORRECTION 2026-08-08) and the audit's "two deciders"
// finding. This module is the merge: ONE total pure decision over the entry's
// facts. Every commit paints — 'wait' is unrepresentable, same law as R2.
//
// OA8 (owner ruling 2026-08-08) IS the semantics here, stated directly:
//
//   frozen when AFFORDABLE  — a frozen last-good body exists, so the frame
//                             can show content without the destination's live
//                             resolution (the handoff frame and the OA6.1
//                             resolution-gap case are the same decision now);
//   skeleton when NOT       — no frozen body exists; an honest brief skeleton
//                             beats a frozen finger. There is NO ban on a
//                             revisit skeleton: no-skeleton-on-revisit is an
//                             OUTCOME retention engineers, never a rule this
//                             resolver enforces.
//   live when RESIDENT      — the entry's resolution is ready and no handoff
//                             is withholding it: paint the real rows.
//
// THE LATCH IS SUBSUMED (OA8): the readiness ledger's "has shown content"
// latch existed only to pick frozen-vs-skeleton on a resolution gap — but a
// frozen body can only exist because a live body was built and recorded, so
// `hasFrozenBody` IS the latch fact, held by the store that actually has the
// body. The ledger class is deleted with R8; nothing else read it.
//
// RN-free on purpose (pure jest lane).

export type TrackPaintBody = 'live' | 'frozen' | 'skeleton';

export type TrackPaintFacts = {
  /**
   * The press-up handoff is withholding this entry's real body from THIS
   * commit (planTrackEntryHandoff said 'defer' and the rAF release has not
   * fired). The handoff decision stays its own pure module — it answers
   * "can the finger afford this frame", a motion-side fact; this resolver
   * consumes its verdict as one input instead of running a rival branch.
   */
  isHandingOff: boolean;
  /** A concrete body resolution exists this commit (isResolutionReady). */
  ready: boolean;
  /**
   * The resolution carries REAL ROWS (resolutionHasRealRows): a mounted body,
   * or a list with rowCount > 0. Red-team F-3 (2026-08-09): a ready ZERO-ROW
   * list is the scene SPEAKING (the OA12 awaiting face mid-toggle, a declared
   * empty state) and still paints LIVE — but it must never be RECORDED as the
   * entry's frozen last-good body, or switching away mid-awaiting and back
   * paints a frozen empty face as if it were content. Mounted lanes are
   * unaffected by construction: resolutionHasRealRows is true for every
   * mounted resolution (the component's internal loading is the scene's own
   * declared state — the host does not reach in), so they keep freezing
   * exactly as before. Only zero-row LIST lanes lose the freeze — and their
   * handoff frames then fall to the skeleton, the honest face under OA8.
   */
  hasRealRows: boolean;
  /** A frozen last-good body exists for this entry (lastGoodListRef). */
  hasFrozenBody: boolean;
};

export type TrackPaintDecision = {
  body: TrackPaintBody;
  /**
   * True exactly when the built live body must be recorded as the entry's
   * frozen last-good body — the write that makes 'frozen' affordable later.
   * Stated by the resolver so the store write cannot drift to a different
   * condition than the paint decision it feeds.
   */
  freezeLiveBody: boolean;
};

/** THE DECISION, total and pure — every branch is a stated body, never a wait. */
export const resolveTrackPaint = (facts: TrackPaintFacts): TrackPaintDecision => {
  if (facts.isHandingOff) {
    // The flip frame paints without the destination's live resolution:
    // frozen when affordable, skeleton when not (OA8 — even on a revisit).
    return { body: facts.hasFrozenBody ? 'frozen' : 'skeleton', freezeLiveBody: false };
  }
  if (facts.ready) {
    // Live always paints (an empty face is the scene speaking), but only a
    // body with REAL ROWS is worth freezing: recording an awaiting/empty
    // publication would replay a frozen empty face on the next switch-back.
    return { body: 'live', freezeLiveBody: facts.hasRealRows };
  }
  // No resolution this commit: frozen when affordable, skeleton when not.
  return { body: facts.hasFrozenBody ? 'frozen' : 'skeleton', freezeLiveBody: false };
};
