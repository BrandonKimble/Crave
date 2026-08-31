/**
 * THE WORKER-LANE DECLINE ALARM (waves 3-4 red team, W1 — the sweep
 * tripwire's sibling for the lane the load actually uses).
 *
 * `GroundingSweepTripwire` reads the decline rate of ONE batch run — but the
 * reload's dominant grounding lane is mention-driven: unified-processing
 * enqueues per place mention → BullMQ → `enrichPlaceById` → `enrichPlace`,
 * and each job is its own "run", so a chooser misbehaving at scale would
 * spend definitive strikes job-by-job with zero alarm — the exact 08-20
 * disease (716/716 declines, 716 permanent strikes) one lane over.
 *
 * The rate is a property of the LANE, not the loop, so this alarm reads it
 * from the DURABLE breadcrumbs the lane already writes, not from any one
 * caller's in-memory accumulator:
 *
 *   - declines: `restaurant_metadata->'lastEnrichmentAttempt'` rows with
 *     status 'no_match' whose `failureAt` falls inside the rolling window
 *     (each no_match overwrites the entity's breadcrumb — one decline per
 *     entity per window, which is exactly the strike grain being guarded);
 *   - successes: `restaurant_metadata->'googlePlaces'->>'fetchedAt'` inside
 *     the window (a successful grounding stamps fetchedAt and DELETES the
 *     failure breadcrumb — mergePlaceMetadata's `extras === null` arm).
 *
 * Because the evidence is durable, the verdict survives worker restarts: a
 * rebooted worker re-reads the same window and re-trips immediately —
 * unlike an in-memory latch, which a crash would silently reset.
 *
 * On trip: the caller HOLDS the lane fail-closed (jobs return 'skipped' —
 * no Places spend, no strike spend, the cohort keeps its retries) and emits
 * a critical ops alert. The hold is also latched in-process so the DB is
 * not re-queried while held. Recovery is operator-shaped, as with the
 * sweep: fix the root cause, void the strikes, restart the worker after
 * the window has aged out (or clear the breadcrumbs via retryTerminal).
 *
 * Transient errors and skips count as neither (an outage is not a ruling) —
 * same taxonomy as the sweep tripwire. Sweep-written breadcrumbs land in
 * the same window; that is deliberate: the rate belongs to the CHOOSER,
 * whichever driver invoked it.
 */

export const WORKER_LANE_MIN_ATTEMPTS = 20;
export const WORKER_LANE_MAX_DECLINE_RATE = 0.9;
export const WORKER_LANE_WINDOW_MINUTES = 120;
/** Re-read the window at most this often — one cheap aggregate per interval,
 *  not one per job at concurrency 5. */
export const WORKER_LANE_RECHECK_MS = 30_000;

export interface WorkerLaneWindowCounts {
  declines: number;
  successes: number;
}

export interface WorkerLaneVerdict {
  held: boolean;
  attempts: number;
  declines: number;
}

export function workerLaneHoldMessage(v: WorkerLaneVerdict): string {
  return (
    `GROUNDING WORKER LANE HELD: ${v.declines}/${v.attempts} completed ` +
    `attempts (${((100 * v.declines) / Math.max(v.attempts, 1)).toFixed(1)}%) ` +
    `in the trailing ${WORKER_LANE_WINDOW_MINUTES}-minute window came back ` +
    `no_match — above the ${(WORKER_LANE_MAX_DECLINE_RATE * 100).toFixed(0)}% ` +
    `bound. A decline rate this high across this many entities is a broken ` +
    `judge or broken candidate retrieval, not that many correct rejections ` +
    `(the 2026-08-20 sweep declined 716/716 including Rudys and Shake Shack ` +
    `and spent a permanent strike on each). Mention-driven enrichment jobs ` +
    `are being skipped — no further strikes or Places dollars are being ` +
    `spent. Fix the root cause, void this window's strikes, then restart ` +
    `the worker after the window ages out (or clear via retryTerminal).`
  );
}

/**
 * Pure decision core + latch. The DB read is injected so every caller (and
 * the spec's simulated 08-20 run) wires the same judgment.
 */
export class WorkerLaneDeclineAlarm {
  private held = false;
  private lastCheckAtMs = 0;
  private lastVerdict: WorkerLaneVerdict = {
    held: false,
    attempts: 0,
    declines: 0,
  };

  constructor(
    private readonly minAttempts = WORKER_LANE_MIN_ATTEMPTS,
    private readonly maxDeclineRate = WORKER_LANE_MAX_DECLINE_RATE,
    private readonly recheckMs = WORKER_LANE_RECHECK_MS,
  ) {}

  /**
   * Returns the lane verdict, re-reading the durable window through
   * `readCounts` when the cached one is stale. Once held, stays held for
   * the process lifetime (fail-closed; the durable window re-trips a
   * restarted process on its first check while the evidence stands).
   */
  async evaluate(
    readCounts: () => Promise<WorkerLaneWindowCounts>,
    nowMs = Date.now(),
  ): Promise<WorkerLaneVerdict> {
    if (this.held) {
      return this.lastVerdict;
    }
    if (
      this.lastCheckAtMs !== 0 &&
      nowMs - this.lastCheckAtMs < this.recheckMs
    ) {
      return this.lastVerdict;
    }
    const counts = await readCounts();
    const attempts = counts.declines + counts.successes;
    const tripped =
      attempts >= this.minAttempts &&
      counts.declines / attempts > this.maxDeclineRate;
    this.lastCheckAtMs = nowMs;
    this.lastVerdict = { held: tripped, attempts, declines: counts.declines };
    if (tripped) {
      this.held = true;
    }
    return this.lastVerdict;
  }
}
