/**
 * Snap-crossing predicate (Phase-3 Leg 3 — phase-1 design §4.2, ledger N-3/N-4/O-2).
 *
 * THE trigger for freeze-mode content swaps: a pure, worklet-safe position condition
 * over the sheet's animated Y. The boundary handoff arms within a small visual-frame
 * tolerance BEFORE the numeric snap Y (O-2: the frame rendered AT the snap already
 * shows the new bundle; never switches during mid-travel far from the target), and the
 * tolerance is VELOCITY-SCALED so a fast flick still swaps on the frame that crosses.
 *
 * Degenerate rule (N-4, the owner's key nuance): the predicate is a STATE condition —
 * "the sheet is at (or within one frame of) the target" — so a freeze whose sheet is
 * ALREADY at the target evaluates true at arm time and the swap fires on press-up with
 * zero wait, by construction.
 *
 * Direction-agnostic: approaching the target from above or below both cross; gesture
 * reversal simply stops the position from ever satisfying the condition (O-4).
 *
 * Pure math, no Reanimated imports — consumed from a useAnimatedReaction worklet
 * (which observes sheetY every UI frame) AND from jest specs. All units are px and
 * px/frame at the call site's frame cadence.
 */

export type SnapCrossingConfig = {
  /** The numeric Y of the target snap (same coordinate space as the observed position). */
  targetY: number;
  /** Base tolerance in px — roughly one frame of slow-spring travel near the snap. */
  baseEpsilonPx: number;
  /** Cap for the velocity-scaled tolerance (a flick must not arm half a screen early). */
  maxEpsilonPx: number;
};

export const DEFAULT_SNAP_CROSSING_BASE_EPSILON_PX = 4;
export const DEFAULT_SNAP_CROSSING_MAX_EPSILON_PX = 28;

/**
 * The effective arming tolerance for the current frame: one frame's worth of travel at
 * the current velocity (|velocityPxPerFrame|), floored at the base tolerance and capped.
 * Worklet-safe (pure arithmetic).
 */
export const resolveSnapCrossingEpsilonPx = (
  config: SnapCrossingConfig,
  velocityPxPerFrame: number
): number => {
  'worklet';

  const velocityMagnitude = velocityPxPerFrame < 0 ? -velocityPxPerFrame : velocityPxPerFrame;
  const scaled =
    velocityMagnitude > config.baseEpsilonPx ? velocityMagnitude : config.baseEpsilonPx;
  return scaled > config.maxEpsilonPx ? config.maxEpsilonPx : scaled;
};

/**
 * True when the observed position is within the effective tolerance of the target —
 * i.e. the NEXT rendered frame will show the sheet at (or past) the snap, so the
 * content swap must be visible in it. Evaluate every UI frame; latch the first true
 * (the crossing fires once — re-arming is the caller's transaction concern).
 */
export const hasCrossedSnap = (
  config: SnapCrossingConfig,
  positionY: number,
  velocityPxPerFrame: number
): boolean => {
  'worklet';

  const epsilon = resolveSnapCrossingEpsilonPx(config, velocityPxPerFrame);
  const delta = positionY - config.targetY;
  const distance = delta < 0 ? -delta : delta;
  return distance <= epsilon;
};
