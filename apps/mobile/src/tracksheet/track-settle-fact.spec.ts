import {
  resolveTrackSettleReport,
  shouldConsumeTrackSettle,
  type TrackNativeSettleEvent,
} from './track-settle-fact';

const settle = (partial: Partial<TrackNativeSettleEvent> = {}): TrackNativeSettleEvent => ({
  generation: 1,
  tau: 600,
  posture: 600,
  atDetent: true,
  detentTau: 600,
  cause: 'spring',
  hiddenEngaged: false,
  ...partial,
});

describe('the native settle fact', () => {
  it("a rest is a rest whether or not it is at a detent (the sampler's first hole)", () => {
    // Under the deleted τ-sampler this produced NO fact at all and the episode
    // rode the 700ms deadline.
    const report = resolveTrackSettleReport(
      settle({ atDetent: false, detentTau: null, posture: 450 }),
      { userOwnsPosture: true }
    );
    expect(report.rest).toBe(true);
    expect(report.detentTau).toBeNull();
    expect(report.postureMemoryTau).toBeNull();
  });

  it('an OFF-SCREEN rest is a rest, and never posture memory (R4: the hidden domain writes no memory)', () => {
    const report = resolveTrackSettleReport(
      // Even if a detent were reported within tolerance, the hidden domain must
      // not write memory — the outgoing offset was snapshotted at hide start.
      settle({ tau: -144, posture: -144, atDetent: true, detentTau: 0, hiddenEngaged: true }),
      { userOwnsPosture: true }
    );
    expect(report.rest).toBe(true);
    expect(report.detentTau).toBeNull();
    expect(report.postureMemoryTau).toBeNull();
  });

  it('posture memory is gesture-written ONLY (a programmatic settle reports but does not remember)', () => {
    expect(resolveTrackSettleReport(settle(), { userOwnsPosture: true })).toEqual({
      rest: true,
      detentTau: 600,
      postureMemoryTau: 600,
    });
    expect(resolveTrackSettleReport(settle(), { userOwnsPosture: false })).toEqual({
      rest: true,
      detentTau: 600,
      postureMemoryTau: null,
    });
  });

  it("a RETURN TO THE SAME DETENT is a new fact (the sampler's second hole)", () => {
    // Drag away and back: the engine mints a new episode generation at the
    // drag's begin, so the same detent settles again. The one-shot the sampler
    // needed (settleReportedTau, never reset by a drag) swallowed this.
    let lastConsumed = 0;
    const first = settle({ generation: 4, detentTau: 300, posture: 300 });
    expect(shouldConsumeTrackSettle(lastConsumed, first)).toBe(true);
    lastConsumed = first.generation;
    const again = settle({ generation: 5, detentTau: 300, posture: 300 });
    expect(shouldConsumeTrackSettle(lastConsumed, again)).toBe(true);
    expect(resolveTrackSettleReport(again, { userOwnsPosture: true }).postureMemoryTau).toBe(300);
  });

  it('a replayed or stale generation is not a new rest', () => {
    expect(shouldConsumeTrackSettle(7, settle({ generation: 7 }))).toBe(false);
    expect(shouldConsumeTrackSettle(7, settle({ generation: 6 }))).toBe(false);
    expect(shouldConsumeTrackSettle(7, settle({ generation: 8 }))).toBe(true);
  });

  it('every cause the engine can report is a rest (spring / decelerate / dragEnd)', () => {
    (['spring', 'decelerate', 'dragEnd'] as const).forEach((cause) => {
      expect(resolveTrackSettleReport(settle({ cause }), { userOwnsPosture: true }).rest).toBe(
        true
      );
    });
  });
});
