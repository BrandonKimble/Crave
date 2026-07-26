import {
  CUTOUT_BAND_EDGE_BLEED,
  CUTOUT_BAND_SEAM_OVERLAP,
  resolveCutoutBandGeometry,
} from './cutout-band-geometry';

/**
 * Pixel-identity proofs for the simplified infinite-edge mechanism: the masked
 * plate + flanking panes must cover EXACTLY the span the legacy giant plate did
 * (`[-overscrollMargin, contentExtent + overscrollMargin]`), with a real overlap
 * at each seam and no pane ever reaching a hole. Visual truth (frost through the
 * cutouts, seam invisibility on-device) still needs the simulator — these lock
 * the geometry.
 */

const legacySpan = ({
  viewportWidth,
  edgeInset,
  contentExtent,
}: {
  viewportWidth: number;
  edgeInset: number;
  contentExtent: number;
}) => {
  // The shipped reference: overscrollMargin = max(inset, viewport);
  // maskWidth = max(viewport, extent + 2·margin) at left: -margin. The outer max
  // never bites when holes exist (margin ≥ viewport ⇒ extent + 2·margin ≥ viewport).
  const margin = Math.max(edgeInset, viewportWidth);
  return { left: -margin, right: contentExtent + margin };
};

const cases = [
  // Toggle strip: contentInset 20, typical device viewport, content wider than viewport.
  { viewportWidth: 393, edgeInset: 20, contentExtent: 610 },
  // Toggle strip: content narrower than the viewport (few toggles).
  { viewportWidth: 393, edgeInset: 20, contentExtent: 180 },
  // Home shelf: OVERLAY_HORIZONTAL_PADDING inset, card band.
  { viewportWidth: 390, edgeInset: 20, contentExtent: 900 },
  // Pre-layout frame: viewport not yet measured (margin falls back to the inset).
  { viewportWidth: 0, edgeInset: 20, contentExtent: 300 },
];

describe('resolveCutoutBandGeometry', () => {
  it.each(cases)('plate ∪ panes covers exactly the legacy giant-plate span (%o)', (input) => {
    const g = resolveCutoutBandGeometry(input);
    const legacy = legacySpan(input);
    // Left pane starts where the legacy plate started.
    expect(g.leftPane.left).toBe(legacy.left);
    // Right pane ends where the legacy plate ended.
    expect(g.rightPane.left + g.rightPane.width).toBe(legacy.right);
    // No gap: each pane overlaps the plate by the seam overlap.
    const plateRight = g.plateLeft + g.plateWidth;
    expect(g.leftPane.left + g.leftPane.width - g.plateLeft).toBe(CUTOUT_BAND_SEAM_OVERLAP);
    expect(plateRight - g.rightPane.left).toBe(CUTOUT_BAND_SEAM_OVERLAP);
  });

  it.each(cases)('panes never encroach on the hole region [0, contentExtent] (%o)', (input) => {
    const g = resolveCutoutBandGeometry(input);
    // Holes live in content coordinates x ≥ 0; the left pane's right edge stops a
    // full apron (minus the 1px overlap) short of x = 0, and symmetrically right.
    expect(g.leftPane.left + g.leftPane.width).toBeLessThanOrEqual(
      -(CUTOUT_BAND_EDGE_BLEED - CUTOUT_BAND_SEAM_OVERLAP)
    );
    expect(g.rightPane.left).toBeGreaterThanOrEqual(
      input.contentExtent + CUTOUT_BAND_EDGE_BLEED - CUTOUT_BAND_SEAM_OVERLAP
    );
  });

  it('offsets holes by the apron so band coordinates are unchanged', () => {
    const g = resolveCutoutBandGeometry({ viewportWidth: 393, edgeInset: 20, contentExtent: 500 });
    // A hole at content x lands at plateLeft + holeOffsetX + x = x in band coords —
    // exactly where the legacy plate painted it (-margin + (x + margin)).
    expect(g.plateLeft + g.holeOffsetX).toBe(0);
  });

  it('overscroll margin keeps the legacy semantics: at least one viewport width', () => {
    const g = resolveCutoutBandGeometry({ viewportWidth: 393, edgeInset: 20, contentExtent: 500 });
    expect(g.overscrollMargin).toBe(393);
    const g2 = resolveCutoutBandGeometry({ viewportWidth: 10, edgeInset: 20, contentExtent: 500 });
    expect(g2.overscrollMargin).toBe(20);
  });
});
