import {
  classifyTrackSettleDetent,
  planTrackMotionCommand,
  resolveTrackPosture,
} from './track-motion-plan';

// The host's motion arithmetic, now falsifiable without a renderer. Geometry of
// the harness world: expandedTop 100, middleTop 400, collapsedTop 700 →
// trackH 600, middleTau 300.
const trackH = 600;
const middleTau = 300;

describe('resolveTrackPosture (THE ONE posture formula)', () => {
  it('subtracts sigma from tau', () => {
    expect(resolveTrackPosture(500, 120, trackH)).toBe(380);
  });

  it('clamps at 0 — the hidden domain is NEVER a negative posture', () => {
    expect(resolveTrackPosture(-144, 0, trackH)).toBe(0);
  });

  it('clamps at the track height — an over-scrolled list is not a taller sheet', () => {
    expect(resolveTrackPosture(900, 0, trackH)).toBe(trackH);
  });
});

describe('planTrackMotionCommand (target + THE ZERO-PIXEL SETTLE)', () => {
  const plan = (snap: 'expanded' | 'middle' | 'collapsed' | 'hidden', currentPosture: number) =>
    planTrackMotionCommand({ snap, trackH, middleTau, currentPosture });

  it('maps the three detents to posture tau', () => {
    expect(plan('expanded', 0).postureTau).toBe(trackH);
    expect(plan('middle', 0).postureTau).toBe(middleTau);
    expect(plan('collapsed', 600).postureTau).toBe(0);
  });

  it('hidden commands the INTENT, not a pixel (the engine owns the depth)', () => {
    expect(plan('hidden', 0).postureTau).toBe('hidden');
  });

  it('a hidden excursion ALWAYS moves — its target is below every posture', () => {
    expect(plan('hidden', 0).willMove).toBe(true);
    expect(plan('hidden', trackH).willMove).toBe(true);
  });

  it('a same-posture snap will NOT move (native short-circuits <0.5pt)', () => {
    expect(plan('expanded', trackH).willMove).toBe(false);
    expect(plan('middle', middleTau + 0.4).willMove).toBe(false);
  });

  it('0.5pt IS the boundary — at it the snap moves and owes a settle', () => {
    expect(plan('middle', middleTau + 0.5).willMove).toBe(true);
    expect(plan('collapsed', 0.5).willMove).toBe(true);
  });
});

describe('classifyTrackSettleDetent (posture memory writer, ±2pt)', () => {
  it('names the detent the gesture rested on', () => {
    expect(classifyTrackSettleDetent(trackH, trackH, middleTau)).toBe('expanded');
    expect(classifyTrackSettleDetent(middleTau, trackH, middleTau)).toBe('middle');
    expect(classifyTrackSettleDetent(0, trackH, middleTau)).toBe('collapsed');
  });

  it('honors the ±2pt epsilon on both detents', () => {
    expect(classifyTrackSettleDetent(trackH - 2, trackH, middleTau)).toBe('expanded');
    expect(classifyTrackSettleDetent(middleTau + 2, trackH, middleTau)).toBe('middle');
  });

  it('COLLAPSED is the catch-all — an off-detent rest is never mis-seated up', () => {
    expect(classifyTrackSettleDetent(trackH - 3, trackH, middleTau)).toBe('collapsed');
    expect(classifyTrackSettleDetent(middleTau - 50, trackH, middleTau)).toBe('collapsed');
  });
});
