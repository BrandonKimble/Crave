/**
 * CUTOUT-BAND GEOMETRY (pure — the one implementation of the infinite-edge illusion).
 *
 * A horizontally-scrollable cutout band (toggle strip, home shelves) paints white
 * "material" with mask holes punched through to the frost. Rubber-band overscroll
 * must never reveal a hard white edge, so the material has to run a full viewport
 * width past both ends of the content.
 *
 * The ORIGINAL mechanism sized ONE giant masked SVG plate across the entire
 * overscroll range (`maskWidth = extent + 2·overscrollMargin` at
 * `left: -overscrollMargin`). But the overscroll regions are hole-less solid
 * white — a mask there buys nothing. This module produces the SAME pixels from:
 *
 *   1. a masked plate ONLY over the content extent (plus a small solid
 *      `EDGE_BLEED` apron on each side), holes offset by `holeOffsetX`;
 *   2. two PLAIN white flanking panes (simple Views) covering the rest of the
 *      overscroll range on each side.
 *
 * SEAM HANDLING — zero-hairline by construction: each pane OVERLAPS the plate's
 * solid apron by `SEAM_OVERLAP` (1px) instead of abutting it, and both are painted
 * with the same color token, so sub-pixel layout rounding / SVG edge antialiasing
 * can never open a translucent seam. The overlap lands inside the apron, which is
 * guaranteed hole-free: holes live in content coordinates (x ≥ 0), a full
 * `EDGE_BLEED` away from where the pane's overlapping edge stops.
 *
 * Pixel identity with the legacy giant plate:
 *   plate ∪ panes  =  [-overscrollMargin, contentExtent + overscrollMargin]
 * — exactly the legacy plate's span, same color, same height, same holes at the
 * same band coordinates.
 */

/** Solid apron the masked plate extends past the content on each side. Holes never
 *  reach it, so the flanking panes' 1px overlap can never clip a cutout. */
export const CUTOUT_BAND_EDGE_BLEED = 8;

/** Pane-over-plate overlap that makes the seam unrepresentable. */
export const CUTOUT_BAND_SEAM_OVERLAP = 1;

export type CutoutBandPane = {
  /** Band-coordinate left edge of the pane. */
  left: number;
  width: number;
};

export type CutoutBandGeometry = {
  /** How far the material runs past each content end (legacy semantics: at least
   *  one full viewport width, never less than the page edge inset). */
  overscrollMargin: number;
  /** Masked plate: band-coordinate left edge (always `-EDGE_BLEED`). */
  plateLeft: number;
  /** Masked plate width: content extent + both aprons. */
  plateWidth: number;
  /** Add to each hole's content-coordinate x to land it on the plate. */
  holeOffsetX: number;
  leftPane: CutoutBandPane;
  rightPane: CutoutBandPane;
};

export const resolveCutoutBandGeometry = ({
  viewportWidth,
  edgeInset,
  contentExtent,
}: {
  /** Measured band viewport width. */
  viewportWidth: number;
  /** Page-content horizontal inset (the scrollable inset / overlay padding). */
  edgeInset: number;
  /** Rightmost material-relevant content x (max hole extent / content width). */
  contentExtent: number;
}): CutoutBandGeometry => {
  const overscrollMargin = Math.max(edgeInset, viewportWidth);
  const paneWidth = Math.max(
    0,
    overscrollMargin - CUTOUT_BAND_EDGE_BLEED + CUTOUT_BAND_SEAM_OVERLAP
  );
  return {
    overscrollMargin,
    plateLeft: -CUTOUT_BAND_EDGE_BLEED,
    plateWidth: contentExtent + CUTOUT_BAND_EDGE_BLEED * 2,
    holeOffsetX: CUTOUT_BAND_EDGE_BLEED,
    leftPane: { left: -overscrollMargin, width: paneWidth },
    rightPane: {
      left: contentExtent + CUTOUT_BAND_EDGE_BLEED - CUTOUT_BAND_SEAM_OVERLAP,
      width: paneWidth,
    },
  };
};
