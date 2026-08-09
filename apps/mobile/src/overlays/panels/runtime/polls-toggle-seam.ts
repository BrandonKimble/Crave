/**
 * THE POLLS TOGGLE-SEAM [PERF] PROBE (dev-only).
 *
 * OA12 (2026-08-08) killed the rest of this module: the awaiting face is minted by
 * the toggle primitive itself (useContentToggle's `awaitingFace`, from
 * resolveToggleAwaitingMaterial — variant A is the law, with no A/B flag and no
 * bare-white arm; `isPollsToggleSeamSkeletonArmed` and its dev global are dead).
 * What remains is the press->painted measurement:
 *
 * One anchor at the press edge (markPollsToggleSeamPress, called inside
 * scheduleFeedQueryCommit — the same synchronous stack as the control's optimistic
 * flip), one report at the first REAL poll row's committed layout after that press
 * (reportPollsToggleSeamSlicePainted, called from the row wrapper's onLayout). The
 * probe cannot go green off the skeleton: the awaiting face never calls the reporter,
 * and the reporter refuses paintedPollCount <= 0 — a report is only honest when an
 * actual new-slice row laid out.
 */

type PollsToggleSeamProbeState = {
  pressAtMs: number | null;
};

const probeState: PollsToggleSeamProbeState = { pressAtMs: null };

/** The ONE anchor: called on the press edge (synchronous with the control flip). */
export const markPollsToggleSeamPress = (nowMs: number = Date.now()): void => {
  if (!__DEV__) {
    return;
  }
  // A tap burst re-anchors on the LAST press (matches the seam's lastPressToReadyMs);
  // the span reported is press → the slice those coalesced presses bought.
  probeState.pressAtMs = nowMs;
};

/**
 * The report edge: the first real poll row's committed layout after a pending press.
 * Returns the measured span (ms) when a measurement was taken, null otherwise —
 * the return value is the test port. Refuses paintedPollCount <= 0: a skeleton or
 * empty face laying out must never produce a green measurement.
 */
export const reportPollsToggleSeamSlicePainted = (
  paintedPollCount: number,
  nowMs: number = Date.now()
): number | null => {
  if (!__DEV__) {
    return null;
  }
  if (probeState.pressAtMs == null || paintedPollCount <= 0) {
    return null;
  }
  const spanMs = nowMs - probeState.pressAtMs;
  probeState.pressAtMs = null;
  // eslint-disable-next-line no-console
  console.log(
    `[PERF] polls-toggle-seam press->painted ${JSON.stringify({ spanMs, paintedPollCount })}`
  );
  return spanMs;
};

/** Test-only reset so specs never leak a pending press into each other. */
export const resetPollsToggleSeamProbeForTest = (): void => {
  probeState.pressAtMs = null;
};
