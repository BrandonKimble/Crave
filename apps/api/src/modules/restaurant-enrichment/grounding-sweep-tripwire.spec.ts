import {
  GroundingSweepHaltError,
  GroundingSweepTripwire,
} from './grounding-sweep-tripwire';

describe('GroundingSweepTripwire', () => {
  it('PROVEN RED on the 2026-08-20 shape: an all-decline sweep halts at the minimum window instead of spending 716 strikes', () => {
    const tripwire = new GroundingSweepTripwire();
    let halted: GroundingSweepHaltError | null = null;
    let spent = 0;
    try {
      for (let i = 0; i < 716; i += 1) {
        tripwire.record('no_match');
        spent += 1;
      }
    } catch (error) {
      halted = error as GroundingSweepHaltError;
    }
    expect(halted).toBeInstanceOf(GroundingSweepHaltError);
    // The 08-20 run spent 716 strikes; the tripwire caps the damage at the
    // minimum meaningful window.
    expect(spent).toBe(19);
    expect(halted!.attempts).toBe(20);
    expect(halted!.declines).toBe(20);
    expect(halted!.message).toContain('No further strikes');
  });

  it('stays green on a healthy mixed run (half declines is a working judge over a noisy backlog)', () => {
    const tripwire = new GroundingSweepTripwire();
    expect(() => {
      for (let i = 0; i < 500; i += 1) {
        tripwire.record(i % 2 === 0 ? 'updated' : 'no_match');
      }
    }).not.toThrow();
  });

  it('stays green exactly AT the bound and fires just above it', () => {
    const atBound = new GroundingSweepTripwire(10, 0.9);
    expect(() => {
      // 9 declines / 10 attempts = 0.9, not > 0.9
      for (let i = 0; i < 9; i += 1) atBound.record('no_match');
      atBound.record('updated');
    }).not.toThrow();

    const aboveBound = new GroundingSweepTripwire(10, 0.9);
    expect(() => {
      for (let i = 0; i < 10; i += 1) aboveBound.record('no_match');
    }).toThrow(GroundingSweepHaltError);
  });

  it('skips and errors are neither judgments nor successes — a run of pure outages never halts and never masks', () => {
    const tripwire = new GroundingSweepTripwire();
    expect(() => {
      for (let i = 0; i < 100; i += 1) tripwire.record('error');
      for (let i = 0; i < 100; i += 1) tripwire.record('skipped');
    }).not.toThrow();
    // ...and they do not dilute a real all-decline run either.
    expect(() => {
      for (let i = 0; i < 25; i += 1) tripwire.record('no_match');
    }).toThrow(GroundingSweepHaltError);
  });
});
