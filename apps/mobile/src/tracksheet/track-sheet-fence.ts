// ─── THE SHEET-LEG FENCE (R7 — closing D2, the deferred motion-PENDING side) ──
//
// The world episode's 'sheet' join input means "the sheet is not physically
// moving". The track host inherited the READY side of the fence from the old
// host (settle → ready; at-rest arm → ready immediately) but deferred the
// PENDING side: "producing it without a proven motion signal would trade a hang
// for a freeze". The track NOW HAS proven motion signals on both sides, so the
// fence can be wired honestly:
//
//   PENDING (motion begins — every producer is a real motion fact):
//     • a motion command that WILL move (executeMotionCommand's willMove — the
//       same fact that arms the settle token), including the hidden excursion;
//     • a native drag begin (physics.dragging false→true, TrackSheetPage's
//       onDragBegin reaction) — the finger owns τ, the sheet is moving.
//   RESTORE (motion ends — every producer is a real rest fact):
//     • the settle observer (a detent rest, gesture or programmatic);
//     • the hidden-edge event (trackHiddenEdgeCleared — a hide's rest is not a
//       detent, this IS its settle);
//     • the 700ms settle deadline (the same never-strand backstop the
//       settleToken rides — a lost settle costs one beat, never a hang).
//
// Motion-keyed on BOTH sides, so a deferred/no-op snap can never strand the bit
// (a no-move command never flips pending; every pending flip has a rest fact or
// a deadline behind it).
//
// This module is the PURE half: the at-rest decision the host's runtime
// subscriber uses before self-offering 'sheet' (the "redraw arms while the
// sheet is already at rest → ready immediately" case must not fire mid-flight —
// that offer used to run on EVERY runtime publish and would have clobbered any
// pending flip in the same tick). Falsified in track-sheet-fence.spec.ts.

export type SheetLegMotionFacts = {
  /** The finger owns τ (physics.dragging). */
  dragging: boolean;
  /** A commanded spring's destination is live (G-INTERRUPT's in-flight target;
   *  detent snaps only — hidden excursions record none by design). */
  inFlightSnapTarget: 'expanded' | 'middle' | 'collapsed' | null;
  /** A motion command's settle token has not completed (flight or hide in
   *  progress; cleared at every settle fact and at the 700ms deadline). */
  pendingSettleToken: number | null;
  /** A hidden excursion is in flight (its target is not a detent, so neither
   *  of the two facts above covers it when the command carried no token). */
  hiddenExcursionInFlight: boolean;
};

/** True iff NO proven motion fact is live — the only state in which the sheet
 *  leg may self-offer 'sheet' outside a rest event. */
export const sheetLegIsAtRest = (facts: SheetLegMotionFacts): boolean =>
  !facts.dragging &&
  facts.inFlightSnapTarget == null &&
  facts.pendingSettleToken == null &&
  !facts.hiddenExcursionInFlight;
