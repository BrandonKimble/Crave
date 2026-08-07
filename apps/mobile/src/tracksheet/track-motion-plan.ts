// ─── THE MOTION COMMAND PLAN (host extraction 1, pure half) ───────────────────
//
// These three decisions used to be arithmetic inlined in the host's
// executeMotionCommand / onGestureSettle / resolveCurrentSnapTarget. They are
// the only DECISIONS in the motion controller — everything else there is
// plumbing (dispatch a fact, call native, arm a timer) — so they leave the
// .tsx and become falsifiable without a renderer, per the system's own pattern
// (pure decision + falsifier; the host executes).
//
// RN-free on purpose, same law as track-motion-authority.ts.

import type { TrackSnapCommand, TrackSnapDetent } from './track-motion-authority';

/** THE ONE POSTURE FORMULA: the sheet's detent-space position, clamped to the
 *  track. τ and σ are the native mirrors; H is the track height. Two host call
 *  sites (the command's will-move test and the interrupt read) computed this
 *  by hand, identically — one formula, one place. */
export const resolveTrackPosture = (tau: number, sigma: number, trackH: number): number =>
  Math.min(Math.max(0, tau - sigma), trackH);

export type TrackMotionCommandPlan = {
  /** The posture τ to command, or the HIDDEN INTENT — the engine states the
   *  pixel for the excursion (ratified item 5; JS no longer owns the depth). */
  postureTau: number | 'hidden';
  /**
   * THE ZERO-PIXEL SETTLE (joinWait red team): a same-posture snap short-
   * circuits inside native snapTo (<0.5pt) and produces NO settle fact —
   * waiting the 700ms fallback held every tab switch's revealed/settled edges
   * ~1s past paint. A hidden excursion ALWAYS moves: its target is below
   * collapsed and the clamped posture is >= 0, so it is stated, not computed.
   */
  willMove: boolean;
};

export type TrackMotionCommandInput = {
  snap: TrackSnapCommand;
  /** Track height (collapsedTop − expandedTop) = the expanded detent's τ. */
  trackH: number;
  /** The middle detent's τ (collapsedTop − middleTop). */
  middleTau: number;
  /** Live posture, already clamped (resolveTrackPosture). */
  currentPosture: number;
};

export const planTrackMotionCommand = ({
  snap,
  trackH,
  middleTau,
  currentPosture,
}: TrackMotionCommandInput): TrackMotionCommandPlan => {
  if (snap === 'hidden') {
    return { postureTau: 'hidden', willMove: true };
  }
  const postureTau = snap === 'expanded' ? trackH : snap === 'middle' ? middleTau : 0;
  return { postureTau, willMove: Math.abs(currentPosture - postureTau) >= 0.5 };
};

/** THE detent epsilon (pt): how close to a detent τ a rest must be to count as
 *  seated there. Single-sourced here (the detent classifier's home) and consumed
 *  by the interrupt axis's resting-posture read (track-entry-interrupt.ts) so the
 *  gesture-settle classifier and the promoteAtLeast read can never disagree about
 *  the same physical rest. F9400. */
export const TRACK_DETENT_EPSILON_PX = 2;

/** THE DETENT CLASSIFIER: which seat a GESTURE-born rest landed on. */
export const classifyTrackSettleDetent = (
  detentTau: number,
  trackH: number,
  middleTau: number
): TrackSnapDetent =>
  Math.abs(detentTau - trackH) <= TRACK_DETENT_EPSILON_PX
    ? 'expanded'
    : Math.abs(detentTau - middleTau) <= TRACK_DETENT_EPSILON_PX
      ? 'middle'
      : 'collapsed';
