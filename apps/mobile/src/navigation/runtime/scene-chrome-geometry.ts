import { TOGGLE_STRIP_BAND_HEIGHT } from '../../toggles/toggle-strip-metrics';
import { OVERLAY_TAB_HEADER_HEIGHT } from '../../overlays/overlay-chrome-metrics';
import { getSceneFoundationSpec } from './scene-foundation-spec';
import type { OverlayKey } from '../../overlays/types';

// ─── THE COMPUTED CHROME GEOMETRY (THE PAGE L1) ─────────────────────────────────────
//
// A scene's chrome height is COMPUTED from declared facts — the foundation table's
// strip axis + declared component constants — never measured. This is the law that
// killed the measured-chrome cache and its same-composition-signature guess (the root
// cause of the header/skeleton gap and the previous-page-strip-leaks-into-the-next
// class): a guess-then-correct geometry pipeline is unrepresentable when geometry is
// a pure function every consumer evaluates synchronously in the same committed frame.
//
// The inputs, all declared:
// - OVERLAY_TAB_HEADER_HEIGHT — the chrome row (grab handle + title row + paddings),
//   itself a sum of declared constants; `fixedHeight` in OverlaySheetHeaderChrome makes
//   it physically true (text conforms to geometry — the truncation law's box side).
// - TOGGLE_STRIP_BAND_HEIGHT + the 8px spacer — scenes whose foundation row declares
//   strip: 'header' (the persistent-header extension mount).
// - grabHandle: 'hidden' does NOT change the box (the chrome row keeps its height;
//   only the handle bar + cutout disappear) — no axis here by construction.
//
// 'search' (spec-less by design — owns its chrome content) renders the SAME persistent
// chrome row with an in-list strip, so its chrome height is the base constant; the
// dev-time computed-vs-measured bark in PersistentSheetHeaderHost is the RED instrument
// that catches any future divergence for every scene, search included.
//
// MORPH NOTE (the L1 morph law): no chrome-height morph exists today — the strip's
// edit-mode action row is an absolute-fill layer INSIDE the constant-height band. The
// day a morph needs to change chrome height, it interpolates between two COMPUTED
// heights on one named clock (design §L1); it must not reintroduce measurement.

/** The band block's bottom seam — re-exported from the ONE band-metric home (strip-band
 *  seam law §1) so existing chrome consumers keep their import path. */
import { STRIP_BAND_BOTTOM_SPACER_HEIGHT } from '../../toggles/toggle-strip-metrics';

export const HEADER_STRIP_BOTTOM_SPACER_HEIGHT = STRIP_BAND_BOTTOM_SPACER_HEIGHT;

/**
 * THE chrome height for a presented sheet scene — pure, synchronous, exact, RN-free.
 * The raw declared sum is returned deliberately un-rounded: RN lays EVERY box out on
 * the device pixel grid, so a body inset of 68.25 and the chrome wrapper both render
 * at the same grid point (68.33̄ on @3x — the sim-measured truth). The dev bark
 * compares computed↔measured with sub-pixel tolerance for exactly this reason.
 */
export const computeSceneChromeHeight = (sceneKey: OverlayKey): number => {
  const spec = getSceneFoundationSpec(sceneKey);
  const stripContribution =
    spec?.strip === 'header' ? TOGGLE_STRIP_BAND_HEIGHT + HEADER_STRIP_BOTTOM_SPACER_HEIGHT : 0;
  return OVERLAY_TAB_HEADER_HEIGHT + stripContribution;
};
