import { CONTROL_HEIGHT } from '../screens/Search/constants/ui';

// THE DECLARED BAND HEIGHT (THE PAGE L1 — geometry computed, never measured): the strip
// band's height is a DECLARATION its citizens conform to, not a measurement of them.
// Derived from the one shared control-height token (SelectorChip/FilterChip boxes and
// the SegmentedToggle all render CONTROL_HEIGHT-tall controls) — never hand-listed
// (the type-list disease guard). The band enforces it physically (fixed height +
// overflow hidden), so a misbehaving citizen clips instead of moving page geometry;
// computeSceneChromeHeight (scene-chrome-geometry.ts) sums this into every
// header-strip scene's chrome height synchronously.
export const TOGGLE_STRIP_BAND_HEIGHT = CONTROL_HEIGHT;

/** THE BAND BLOCK's bottom seam (strip-band seam law §1): the 8px white spacer between
 *  a strip band and whatever sits below it — the SAME edge on every basis: the header
 *  host's spacer, the in-list header's bottom strip, an in-content strip's bottom
 *  margin, and the skeleton strip-pill block's gap all consume THIS constant.
 *  Independent seam constants are a grep-invariant failure. */
export const STRIP_BAND_BOTTOM_SPACER_HEIGHT = 8;
