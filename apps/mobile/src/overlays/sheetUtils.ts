import type { WithSpringConfig } from 'react-native-reanimated';
import type { BottomSheetSnapPoints as SnapPoints } from './bottomSheetMotionTypes';

export type SheetPosition = 'hidden' | 'collapsed' | 'middle' | 'expanded';

// F965, banked re-grep (repo-wide per symbol, excluding this file: ZERO hits):
// `SheetGestureContext`, `SHEET_STATES`, `SMALL_MOVEMENT_THRESHOLD` and
// `snapPointForState` are deleted. `snapPointForState` in particular was a worklet-safe
// snap lookup that the gesture runtimes reimplement by indexing the `SnapPoints` record
// directly — so it was not merely unused, it was a second answer to a question already
// answered elsewhere.

export const clampValue = (value: number, lowerBound: number, upperBound: number): number => {
  'worklet';
  return Math.min(Math.max(value, lowerBound), upperBound);
};

/**
 * The OVERLAY-SHEET spring.
 *
 * TWO SPRINGS COEXIST IN THIS APP AND THEIR RELATIONSHIP IS NOT DERIVED (F965). The
 * transition engine's `DEFAULT_TRANSITION_SPRING_CONFIG` (transition-lane-player.ts) is
 * `{damping: 28, stiffness: 220, overshootClamping: true}` and DOES record its
 * derivation (near-critical, must never overshoot the settle ramp). This one is
 * `{damping: 28, stiffness: 320, overshootClamping: false}` and records none — it is the
 * shipped feel of the sheet itself, which is allowed to overshoot slightly and is
 * stiffer because the user's finger just let go of it. Stated so the difference reads as
 * a deliberate distinction rather than a drift, and so nobody "unifies" them: they drive
 * different things (a physical sheet vs an invisible timer) and only share a damping
 * value by coincidence.
 */
export const SHEET_SPRING_CONFIG: WithSpringConfig = {
  damping: 28,
  stiffness: 320,
  mass: 1,
  overshootClamping: false,
};
export const OVERLAY_TIMING_CONFIG = {
  enterDurationMs: 260,
  exitDurationMs: 220,
};

export const resolveExpandedTop = (searchBarTop: number, fallbackTop = 0): number => {
  const preferred = searchBarTop > 0 ? searchBarTop : fallbackTop;
  return Math.max(preferred, 0);
};

// ── THE SNAP GEOMETRY, IN ONE PLACE (F949 + F964) ──────────────────────────────────
//
// `buildExpandedMiddleChromeSnaps` in AppRouteSceneChromeMotionRuntimeProvider used to
// recompute the expanded/middle pair with the IDENTICAL four expressions and the
// IDENTICAL four literals, importing nothing from here. So the sheet and its chrome
// derived their geometry independently from a copied formula — the classic setup where
// tuning one drifts the other silently, on the pair whose whole job is to agree. The
// chrome provider imports `resolveExpandedMiddleSnaps` now; there is one formula.
//
// THE LITERALS ARE NAMED BUT THEIR DERIVATIONS ARE LOST, and this file will say so
// rather than invent one (the honest form the repo already uses for the `[0.985, 1]`
// chrome scale). They are the shipped values; changing any of them is a design decision
// with a visible result, not a refactor. Named, they are at least discussable.

/** The sheet's resting middle as a fraction of screen height, before the
 *  minimum-gap clamp below wins on short screens. Derivation not recorded. */
const MIDDLE_SCREEN_FRACTION = 0.4;
/** The smallest vertical gap the middle detent keeps below the expanded detent, so the
 *  two are never visually adjacent on a short screen. Derivation not recorded. */
const MIDDLE_MIN_GAP_BELOW_EXPANDED_PX = 96;
/** How far BELOW the bottom of the screen the hidden detent parks — fully offscreen with
 *  margin, so a settle at 'hidden' can never leave a sliver. Derivation not recorded. */
const HIDDEN_BELOW_SCREEN_PX = 80;
/** The smallest gap the middle detent keeps above the hidden detent. NOTE: `hidden -
 *  MIDDLE_MIN_GAP_ABOVE_HIDDEN_PX` is exactly `screenHeight - 40` — the two constants
 *  are one number written the long way, preserved as-is because collapsing them would
 *  change nothing and hide the intent (a clamp relative to `hidden`). */
const MIDDLE_MIN_GAP_ABOVE_HIDDEN_PX = 120;
/** The smallest gap the collapsed detent keeps below the middle detent. */
const COLLAPSED_MIN_GAP_BELOW_MIDDLE_PX = 24;
/** Stand-in header height for the frame before the chrome has measured itself.
 *  RECORDED DEBT (F964): the repo now computes this exactly — `computeSceneChromeHeight`
 *  in scene-chrome-geometry.ts — so the honest fallback is the COMPUTED height, not a
 *  magic 96. Left at the shipped value here because changing it moves the collapsed
 *  detent on the pre-measure frame, which is a visual change wanting a sim look. */
const UNMEASURED_HEADER_HEIGHT_PX = 96;

/**
 * THE expanded/middle pair. Both the sheet (`calculateSnapPoints`, 12 consumers) and the
 * route chrome's response zone derive from exactly this.
 */
export const resolveExpandedMiddleSnaps = (
  screenHeight: number,
  searchBarTop: number,
  insetTop: number
): { expanded: number; middle: number; hidden: number } => {
  const expanded = resolveExpandedTop(searchBarTop, insetTop);
  const rawMiddle = screenHeight * MIDDLE_SCREEN_FRACTION;
  const middle = Math.max(expanded + MIDDLE_MIN_GAP_BELOW_EXPANDED_PX, rawMiddle);
  const hidden = screenHeight + HIDDEN_BELOW_SCREEN_PX;
  return {
    expanded,
    middle: Math.min(middle, hidden - MIDDLE_MIN_GAP_ABOVE_HIDDEN_PX),
    hidden,
  };
};

/**
 * Shared snap point calculation used by all overlay sheets.
 * This ensures consistent positioning across results sheet, restaurant overlay,
 * lists overlay, polls overlay, and profile overlay.
 */
export const calculateSnapPoints = (
  screenHeight: number,
  searchBarTop: number,
  insetTop: number,
  navBarOffset: number,
  headerHeight: number
): SnapPoints => {
  const { expanded, middle, hidden } = resolveExpandedMiddleSnaps(
    screenHeight,
    searchBarTop,
    insetTop
  );
  const resolvedNavBarOffset = navBarOffset > 0 ? navBarOffset : screenHeight;
  const resolvedHeaderHeight = headerHeight > 0 ? headerHeight : UNMEASURED_HEADER_HEIGHT_PX;
  const navAlignedCollapsed = resolvedNavBarOffset - resolvedHeaderHeight;
  const finalCollapsed = Math.max(navAlignedCollapsed, middle + COLLAPSED_MIN_GAP_BELOW_MIDDLE_PX);

  return {
    expanded,
    middle,
    collapsed: finalCollapsed,
    hidden,
  };
};
