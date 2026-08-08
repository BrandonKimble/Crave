import type { SceneLoadingRowType } from '../../../components/skeletons';
import { resolveSceneLoadingMaterial } from '../../../navigation/runtime/scene-foundation-spec';

/**
 * THE POLLS TOGGLE SEAM (OA9, 2026-08-08) — the Live/Closed (and every feed-query)
 * toggle's 'awaiting' window, in two parts:
 *
 * 1. THE ARM FLAG. The frontier audit claims the awaiting window paints 340-650ms of
 *    bare white; the owner has NOT witnessed it. Until the on-device measurement
 *    lands, the variant-(b) face (live header strip + results-region skeleton,
 *    resolveSceneLoadingMaterial('polls', 'refetch')) is wired but A/B-able: in dev,
 *    set `globalThis.__CRAVE_POLLS_TOGGLE_SEAM_SKELETON = false` from the debugger
 *    (or Metro console) to restore the old bare-white face, press a toggle, compare.
 *    Default is ARMED. Read at render time on every awaiting flip, so a flip takes
 *    effect on the next toggle press without a reload.
 *
 * 2. THE [PERF] PROBE (dev-only). One anchor at the press edge
 *    (markPollsToggleSeamPress, called inside scheduleFeedQueryCommit — the same
 *    synchronous stack as the control's optimistic flip), one report at the first
 *    REAL poll row's committed layout after that press
 *    (reportPollsToggleSeamSlicePainted, called from the row wrapper's onLayout).
 *    The probe cannot go green off the skeleton: the skeleton face never calls the
 *    reporter, and the reporter refuses paintedPollCount <= 0 — a report is only
 *    honest when an actual new-slice row laid out.
 */

const SEAM_FLAG_GLOBAL = '__CRAVE_POLLS_TOGGLE_SEAM_SKELETON';

export const isPollsToggleSeamSkeletonArmed = (): boolean => {
  if (__DEV__) {
    const override = (globalThis as Record<string, unknown>)[SEAM_FLAG_GLOBAL];
    if (typeof override === 'boolean') {
      return override;
    }
  }
  return true;
};

/**
 * The awaiting-window face decision, pure: armed → the variant-(b) material (polls
 * declares strip 'header', so withStripHoles is false by the resolver's seam law —
 * the live strip stays above the face); disarmed → null (the legacy bare-white gap).
 */
export const resolvePollsToggleSeamAwaitingMaterial = (
  armed: boolean
): { rowType: SceneLoadingRowType; withStripHoles: boolean } | null =>
  armed ? resolveSceneLoadingMaterial('polls', 'refetch') : null;

// ── The [PERF] probe ─────────────────────────────────────────────────────────────────

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
    `[PERF] polls-toggle-seam press->painted ${JSON.stringify({
      spanMs,
      paintedPollCount,
      seamSkeletonArmed: isPollsToggleSeamSkeletonArmed(),
    })}`
  );
  return spanMs;
};

/** Test-only reset so specs never leak a pending press into each other. */
export const resetPollsToggleSeamProbeForTest = (): void => {
  probeState.pressAtMs = null;
};
