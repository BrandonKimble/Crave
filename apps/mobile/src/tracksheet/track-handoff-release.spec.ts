// ─── FALSIFIERS: the handoff release decision (strip choreography fix 2b) ────
//
// The release is a FACT pair, not a clock: the flip frame must have painted
// (the rAF boundary) AND the destination must have a concrete resolution at
// attempt time. Each clause is RED-provable by deleting it: dropping the paint
// clause releases the expensive body inside the finger's frame; dropping the
// readiness clause evicts the handoff paint into a 'none' resolution — the
// skeleton-eviction seam the reveal law forbids.

import { planTrackHandoffRelease } from './track-handoff-release';

describe('planTrackHandoffRelease', () => {
  it('releases only when the flip painted AND the destination resolution is ready', () => {
    expect(
      planTrackHandoffRelease({ flipHasPainted: true, destinationResolutionReady: true })
    ).toBe(true);
  });

  it('NEVER releases before the flip frame painted — the expensive body must not render in the finger frame (mutation: drop the paint clause → RED)', () => {
    expect(
      planTrackHandoffRelease({ flipHasPainted: false, destinationResolutionReady: true })
    ).toBe(false);
  });

  it('WITHHOLDS while the destination resolution is gone — the handoff paint persists instead of being evicted into nothing (mutation: restore the bare-rAF schedule → RED)', () => {
    expect(
      planTrackHandoffRelease({ flipHasPainted: true, destinationResolutionReady: false })
    ).toBe(false);
  });

  it('both facts absent: no release', () => {
    expect(
      planTrackHandoffRelease({ flipHasPainted: false, destinationResolutionReady: false })
    ).toBe(false);
  });
});
