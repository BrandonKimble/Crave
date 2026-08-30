/**
 * THE GROUNDING-SWEEP TRIPWIRE (campaign red-team v3, R1 — the merge
 * tripwire's sibling).
 *
 * On 2026-08-20 a single grounding sweep ran 716 entities end to end
 * (01:13→03:18 UTC) and the chooser declined EVERY one — Rudys (1,315
 * mentions), Easy Tiger, Shake Shack, Joe's Bakery — and every decline was
 * classified DEFINITIVE and spent a permanent strike toward janitor archive.
 * A 100% decline rate over hundreds of famous places is a broken run, not
 * hundreds of correct judgments, and nothing read the rate: the sweep wrote
 * 716 strikes with zero alarm.
 *
 * This module reads the rate. A batch grounding driver records every
 * per-entity outcome here; once the run has enough attempts to mean
 * something, a decline rate over the bound HALTS the run by throwing —
 * strikes stop being spent, the operator is told loudly, and the remaining
 * cohort keeps its retries for after the root cause is fixed. Deliberately a
 * pure accumulator (no I/O): every sweep-shaped caller wires it in one line
 * and the spec can prove it fires RED on the exact 08-20 shape.
 */

export const GROUNDING_SWEEP_MIN_ATTEMPTS = 20;
export const GROUNDING_SWEEP_MAX_DECLINE_RATE = 0.9;

export class GroundingSweepHaltError extends Error {
  constructor(
    public readonly attempts: number,
    public readonly declines: number,
  ) {
    super(
      `GROUNDING SWEEP HALTED: ${declines}/${attempts} attempts ` +
        `(${((100 * declines) / attempts).toFixed(1)}%) came back no_match — ` +
        `above the ${(GROUNDING_SWEEP_MAX_DECLINE_RATE * 100).toFixed(0)}% ` +
        `bound. A decline rate this high over this many entities is a broken ` +
        `judge or broken candidate retrieval, not that many correct ` +
        `rejections (the 2026-08-20 sweep declined 716/716 including Rudys ` +
        `and Shake Shack and spent a permanent strike on each). No further ` +
        `strikes are being spent; fix the root cause, then void this run's ` +
        `strikes and re-run with retryTerminal.`,
    );
    this.name = 'GroundingSweepHaltError';
  }
}

export class GroundingSweepTripwire {
  private attempts = 0;
  private declines = 0;

  constructor(
    private readonly minAttempts = GROUNDING_SWEEP_MIN_ATTEMPTS,
    private readonly maxDeclineRate = GROUNDING_SWEEP_MAX_DECLINE_RATE,
  ) {}

  /**
   * Record one per-entity outcome. Statuses that spend a strike-eligible
   * judgment ('no_match') count as declines; 'updated' counts as success;
   * 'skipped'/'error' are neither (a skip judged nothing; an upstream error
   * is an outage, not a ruling). Throws GroundingSweepHaltError when the
   * run's decline rate crosses the bound.
   */
  record(status: string): void {
    if (status === 'no_match') {
      this.attempts += 1;
      this.declines += 1;
    } else if (status === 'updated') {
      this.attempts += 1;
    } else {
      return;
    }
    if (
      this.attempts >= this.minAttempts &&
      this.declines / this.attempts > this.maxDeclineRate
    ) {
      throw new GroundingSweepHaltError(this.attempts, this.declines);
    }
  }
}
