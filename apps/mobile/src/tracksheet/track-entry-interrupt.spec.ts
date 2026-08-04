// G-INTERRUPT falsifiers (R6 / A5) — jest on the snap-target read mid-flight.
//
// RED conditions (each proven by mutation before landing):
//   (a) mid-flight reads answering from instantaneous posture (the A5
//       misclassification): a spring en route to expanded read as 'collapsed'
//       → the in-flight test fails if the target is not honored.
//   (b) a machine target outliving the finger (the spring-vs-drag fight):
//       dragging=true must ignore inFlightTarget → the finger-first test.
//   (c) resting reads drifting from the host's original ±2 classification →
//       the classify tests pin the tolerance and the collapsed fallback.

import { classifyRestingPosture, resolveSnapTargetForRead } from './track-entry-interrupt';

const geometry = { trackH: 600, middleTau: 300 };

describe('classifyRestingPosture (the at-rest read, tolerance pinned)', () => {
  it('classifies each detent within ±2', () => {
    expect(classifyRestingPosture({ posture: 599, ...geometry })).toBe('expanded');
    expect(classifyRestingPosture({ posture: 301.5, ...geometry })).toBe('middle');
    expect(classifyRestingPosture({ posture: 1.2, ...geometry })).toBe('collapsed');
  });

  it('between detents falls back to collapsed (the promote-still-promotes rule)', () => {
    expect(classifyRestingPosture({ posture: 450, ...geometry })).toBe('collapsed');
  });
});

describe('resolveSnapTargetForRead (A5: the spring TARGET is the truth mid-flight)', () => {
  it('RED-able core: mid-flight to expanded reads EXPANDED, not the posture class', () => {
    // τ caught at 450 (between middle and expanded): the instantaneous read
    // would say 'collapsed' — and promoteAtLeast(middle) would then DEMOTE a
    // sheet already flying to expanded.
    expect(
      resolveSnapTargetForRead({
        inFlightTarget: 'expanded',
        dragging: false,
        posture: 450,
        ...geometry,
      })
    ).toBe('expanded');
  });

  it('mid-flight to middle reads MIDDLE even while τ still sits at expanded', () => {
    expect(
      resolveSnapTargetForRead({
        inFlightTarget: 'middle',
        dragging: false,
        posture: 600,
        ...geometry,
      })
    ).toBe('middle');
  });

  it('THE FINGER OWNS TAU: dragging kills the machine target', () => {
    expect(
      resolveSnapTargetForRead({
        inFlightTarget: 'expanded',
        dragging: true,
        posture: 299,
        ...geometry,
      })
    ).toBe('middle');
  });

  it('no target, no drag: the resting classification answers', () => {
    expect(
      resolveSnapTargetForRead({
        inFlightTarget: null,
        dragging: false,
        posture: 600,
        ...geometry,
      })
    ).toBe('expanded');
  });
});
