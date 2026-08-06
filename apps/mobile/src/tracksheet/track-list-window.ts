// ─── THE LIST'S RENDER WINDOW (touch-latency rung, 2026-08-05) ───────────────
//
// THE MEASURED DEFECT (device, six-switch run — not re-derived here):
//
//   phases polls legs->layout-effect=158ms rows=25 rowInvokes=23 rowDistinct=23
//   rowwindow polls invokes=24 distinct=23 mounts=4 updates=22 ms=181.3 avg=7.0
//
// TWENTY-THREE DISTINCT cards built in the flip frame, on a collapsed sheet that
// shows about one. 23 x 7ms is the whole 158ms. Not the rows' fault, not the
// chrome stack's, not the page's — the list was ASKED for 23 rows.
//
// WHY IT ASKS FOR 23 (FlashList 2.0.2, read, not guessed). The engaged window is
// computed in helpers/EngagedIndicesTracker.js:
//
//   viewportSize = layoutManager.getWindowsSize().height
//   totalBuffer  = drawDistance * 2                      <- note the DOUBLING
//   bufferBefore = ceil(totalBuffer * 0.3)   (forward scroll)
//   bufferAfter  = ceil(totalBuffer * 0.7)
//   extendedStart = max(0, viewportStart - bufferBefore)
//   unusedStartBuffer = max(0, bufferBefore - viewportStart)
//   extendedEnd  = viewportEnd + bufferAfter + unusedStartBuffer
//
// At the top of the list (viewportStart = 0 — which is EVERY tab switch, because
// tau is the scroll offset and a collapsed sheet sits at tau = 0) the whole
// before-buffer is unused and gets redistributed AFTER. So the rendered band is
//
//   viewportSize + 2 * drawDistance
//
// and with the track's drawDistance = SCREEN.height that is ~3 screen-heights of
// content. At ~70pt a card, that is ~23 cards. The number is fully explained.
//
// WHICH LEVER — and why NOT the list's frame. Two terms are in that sum:
//
//   • viewportSize comes from measureParentSize(internalViewRef) in
//     RecyclerView.js — the list's own measured FRAME. The track's list is
//     absoluteFill BY CONSTRUCTION: the scroll view IS the sheet, its content
//     spacer (paddingTop = expandedTop) IS the sheet's travel, and tau IS its
//     scroll offset. Shrinking or moving that frame per posture would make the
//     list's geometry a second writer of the sheet's position and would change
//     what tau means. That is the one thing this architecture has spent the
//     whole arc deleting, so the frame is NOT the lever.
//
//   • drawDistance is a pure additive overscan the list applies around whatever
//     viewport it measured. It changes no geometry, no touch surface, and
//     nothing about where the sheet is. It IS the lever.
//
// THE LAW, then: OVERSCAN IS A FUNCTION OF WHAT THE USER CAN SEE, NOT OF THE
// SCREEN. The sheet's visible height is a TRACK fact — the page owns the snap
// geometry and the settled posture, and the list cannot infer it because the
// list is full-screen on purpose. So the page states it and the overscan
// follows it: a collapsed sheet showing a sliver buys a sliver of headroom, an
// expanded sheet buys a full one.
//
// NOT A CONSTANT, deliberately. A fixed small drawDistance would under-render an
// expanded sheet — trading one wrong number for another. This scales with the
// posture that is actually presented.
//
// FLICK SAFETY comes from the library, not from a fat buffer: the tracker
// PROJECTS the next scroll offset from velocity and averageRenderTime
// (getProjectedScrollOffset, enableOffsetProjection = true by default), so the
// window moves ahead of a fast scroll on its own. The overscan only has to
// cover the projection's error, which is a headroom number — hence the floor
// below rather than a screen-sized constant.
//
// RN-free on purpose (pure jest lane).

/**
 * Fraction of the visible sheet body kept rendered beyond it, per side, BEFORE
 * FlashList's own doubling. The effective rendered band is
 * `viewportSize + 2 * drawDistance`, so this is roughly "one extra visible
 * height of headroom" — enough for the projection to land inside, without
 * paying for content nobody is scrolling toward.
 */
export const TRACK_LIST_OVERSCAN_RATIO = 0.5;

/**
 * The floor. A collapsed sheet shows very little, but a flick from collapsed
 * still has to find rows underneath it — the projection needs somewhere to
 * land. Deliberately expressed in points rather than rows: the window is a
 * geometry fact and must not depend on how tall any one scene's row happens
 * to be.
 */
export const TRACK_LIST_MIN_DRAW_DISTANCE_PX = 200;

/**
 * THE VISIBLE SHEET BODY at a settled posture, in points.
 *
 * tau is posture-space: tau = 0 is collapsed (sheet top at collapsedTop) and
 * tau grows as the sheet rises (sheet top = collapsedTop - tau). So what the
 * user can see of the sheet is the screen below its top edge. Clamped at both
 * ends because a hidden excursion drives tau below 0 and a bounce can drive it
 * past the expanded detent, and neither is a claim about visibility.
 */
export const resolveTrackSheetVisibleHeight = ({
  tau,
  collapsedTop,
  expandedTop,
  screenHeight,
}: {
  tau: number;
  collapsedTop: number;
  expandedTop: number;
  screenHeight: number;
}): number => {
  const sheetTop = Math.min(collapsedTop, Math.max(expandedTop, collapsedTop - tau));
  return Math.max(0, screenHeight - sheetTop);
};

/**
 * THE DECISION, pure and total: how much overscan this posture earns.
 *
 * Capped at the screen height because beyond that the buffer stops being
 * headroom and starts being the whole corpus — which is the defect this exists
 * to remove, and a cap is how it stays removed if the ratio is ever raised.
 */
export const resolveTrackListDrawDistance = ({
  visibleHeight,
  screenHeight,
}: {
  visibleHeight: number;
  screenHeight: number;
}): number => {
  const wanted = Math.round(Math.max(0, visibleHeight) * TRACK_LIST_OVERSCAN_RATIO);
  return Math.min(screenHeight, Math.max(TRACK_LIST_MIN_DRAW_DISTANCE_PX, wanted));
};

/**
 * WHAT THE LIST WILL ACTUALLY RENDER, in points, at the top of the list —
 * FlashList's own arithmetic restated so a falsifier can assert on the
 * CONSEQUENCE (how much content gets built) rather than on the knob. Restating
 * it here is the point: if the library's formula ever changes, a test written
 * against this will disagree with the device and we will find out.
 */
export const projectTrackListRenderedBandPx = ({
  viewportHeight,
  drawDistance,
}: {
  viewportHeight: number;
  drawDistance: number;
}): number => viewportHeight + 2 * drawDistance;
