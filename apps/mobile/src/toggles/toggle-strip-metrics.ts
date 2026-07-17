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
