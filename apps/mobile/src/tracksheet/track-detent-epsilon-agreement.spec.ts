import { classifyRestingPosture } from './track-entry-interrupt';
import { classifyTrackSettleDetent, TRACK_DETENT_EPSILON_PX } from './track-motion-plan';

// F9400: the gesture-settle detent classifier and the interrupt axis's
// resting-posture read must use the SAME detent epsilon — they answer the same
// physical question ("which seat is this rest on?") for the same τ. The epsilon
// is single-sourced (TRACK_DETENT_EPSILON_PX). This spec is the falsifier: if a
// future edit re-introduces a divergent literal in either classifier, a rest
// exactly at the tolerance boundary classifies differently and this reds.
describe('detent-epsilon agreement (F9400)', () => {
  const trackH = 800;
  const middleTau = 400;

  // Sample τ around each detent, including exactly ±epsilon (the boundary the
  // two literals would disagree on if they drifted).
  const e = TRACK_DETENT_EPSILON_PX;
  const taus = [
    trackH,
    trackH - e,
    trackH - e - 0.001,
    middleTau + e,
    middleTau,
    middleTau - e,
    middleTau - e - 0.001,
    0,
    e,
  ];

  it.each(taus)('both classifiers seat τ=%p identically (no epsilon drift)', (tau) => {
    const settle = classifyTrackSettleDetent(tau, trackH, middleTau);
    const resting = classifyRestingPosture({ posture: tau, trackH, middleTau });
    expect(resting).toBe(settle);
  });
});
