// ─── THE HIDDEN EXCURSION (G-HIDDEN, R4 / amendment A1 + A2) ─────────────────
//
// THE SECOND MOTION PRIMITIVE, chosen: (a) τ-DOMAIN EXTENSION, not (b) a
// container translate. The re-derivation that picks it:
//
//   Every derivation in the system is ALREADY linear below collapsed. The
//   sheet-top formula — expandedTop + max(0, H+σ−τ) — has its clamp at the
//   EXPANDED end only; for τ < 0 it yields collapsedTop + σ + |τ| and the
//   sheet keeps gliding off the bottom of the screen, and the native shell
//   writer (frost / tail / chrome pin / row masks) uses the same form, so the
//   ENTIRE visual stack follows a negative τ with zero new writers. The only
//   thing that ever blocked the excursion was UIScrollView's domain floor
//   (offset ≥ −contentInset.top). Extending the DOMAIN (contentInset.top =
//   depth for the excursion's lifetime) is therefore the minimal primitive:
//   one variable, one writer, the same critically damped native spring (the
//   glide is the SAME glide as every detent settle — OA5 by construction),
//   THE FINGER OWNS TAU still true (a finger landing mid-excursion kills the
//   spring and drags the same track), the posture register untouched (it
//   clamps at 0 = collapsed, which is exactly the posture a hidden sheet
//   should remember). A container translate would be a SECOND position
//   writer over the track — the exact class of bug this arc spent months
//   deleting — plus a mid-gesture handoff seam that τ-extension simply does
//   not have.
//
// σ CANCELS BY ALGEBRA: snapTo is posture-space (+σ), so a hidden command's
// τ-target is −depth+σ; sheetTop = expandedTop + (H+σ) − (−depth+σ) =
// collapsedTop + depth = the screen edge, exactly, for any σ.
//
// A2 — THE DEFERRED SWAP: a dismiss that reveals a different scene beneath
// swaps content only when the outgoing sheet CLEARS THE SCREEN EDGE (never a
// visible mid-flight flip; swapping at τ=0 flips chrome while the collapsed
// band is still on screen). The edge fact is native (the engine watches τ
// cross −depth and emits trackHiddenEdgeCleared); the DECISION of what to
// paint while the fact is pending is pure, here, falsifiable.

// THE DEPTH IS NATIVE-OWNED (ratified item 5, 2026-08-05). `computeHiddenDepth`
// / `planHiddenExcursion` / `HiddenExcursionPlan` lived here and derived the
// excursion's pixel target from Dimensions.get('window') at command time. The
// derivation was correct; its INPUT could not be. A module-scope screen
// snapshot commanding a pixel target against live UIKit bounds is G-ROTATE's
// staleness with an address — after a bounds change the sheet glided to a depth
// derived from the previous screen, and the one-shot screen-edge fact armed at
// that stale target fired at the wrong τ (or never).
//
// The engine holds the shell geometry it was bound with and the live window, so
// it states the depth itself, in the same UI block that starts the spring
// (TrackHiddenDepthForBounds + snapToHidden, TrackScrollKit). JS now expresses
// the INTENT — 'hidden' — and never a pixel.
//
// OA5 SURVIVES THE MOVE. The plan type made a teleport unrepresentable; the
// native command does the same thing more strongly: snapToHidden takes no mode,
// no duration and no target, and its one body is TrackPerformSnap — the same
// critically damped spring every detent settle rides. There is no code path
// that places the sheet at the hidden target without gliding there. The
// arithmetic's falsifier moved with it (TrackEngineFactsTests.c, "hidden depth
// from live bounds"), including the never-negative law.

// THE EDGE FACT IS NATIVE-OWNED (F3 kill-list, 2026-08-04): a JS mirror of the
// τ-vs-target comparison (`hasClearedScreenEdge`) lived here, exported and
// consumed by NOTHING on the live path — the real fact is TrackScrollKit's
// trackHiddenEdgeCleared emission. The mirror is deleted; its coverage moved to
// the render lane's host-level test (the deferred swap consumes the native
// event through the real listener wiring — track-host-switch.render-spec.tsx).

export type HiddenPresentation = {
  scene: string;
  entryId: string | null;
  /** True while the swap is DEFERRED: the frame already presents the
   * destination but the outgoing entry must keep painting. */
  deferred: boolean;
};

/**
 * THE SWAP-AT-EDGE DECISION (A2). While a hide excursion is in flight and the
 * screen edge has not been cleared, the host keeps painting the LAST PAINTED
 * entry — chrome and body ride the slide fully opaque — even though the
 * presentation frame has already flipped to the scene beneath. The swap
 * commits in the first render after the edge fact lands (or immediately when
 * the dismiss does not change what is painted).
 */
export const resolveHiddenPresentation = (args: {
  frameScene: string;
  frameEntryId: string | null;
  paintedScene: string;
  paintedEntryId: string | null;
  hideInFlight: boolean;
  edgeCleared: boolean;
}): HiddenPresentation => {
  const sameEntry =
    args.frameScene === args.paintedScene && args.frameEntryId === args.paintedEntryId;
  if (args.hideInFlight && !args.edgeCleared && !sameEntry) {
    return { scene: args.paintedScene, entryId: args.paintedEntryId, deferred: true };
  }
  return { scene: args.frameScene, entryId: args.frameEntryId, deferred: false };
};
