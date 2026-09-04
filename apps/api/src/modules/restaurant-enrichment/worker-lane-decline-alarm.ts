/**
 * THE GROUNDING DECLINE HOLD — ONE hold, evaluated at the `enrichPlace`
 * chokepoint, fed by the durable decline window (red team 2026-09-04 E-6;
 * born as the waves 3-4 W1 worker-lane alarm, the sweep tripwire's sibling).
 *
 * On 2026-08-20 a single grounding sweep ran 716 entities end to end and the
 * chooser declined EVERY one — Rudys (1,315 mentions), Easy Tiger, Shake
 * Shack — and every decline spent a permanent strike toward janitor archive.
 * A decline rate that high over that many famous places is a broken judge or
 * broken candidate retrieval, not that many correct rejections, and nothing
 * read the rate.
 *
 * The rate is a property of the CHOOSER, whichever driver invoked it — the
 * mention-driven worker (one BullMQ job per mention, each its own "run"),
 * the operator sweep (`enrich-restaurants.ts`), the ghost re-grounding
 * script, a `--entity=` run. So the verdict is read from the DURABLE
 * breadcrumbs the lane already writes, never from any one caller's
 * in-memory accumulator (E-6: the sweep used to keep a private counter that
 * could not arm under 20 judged attempts, so a `--limit=10` sweep spent
 * freely while the worker lane was held):
 *
 *   - declines: `restaurant_metadata->'lastEnrichmentAttempt'` rows with
 *     status 'no_match' whose `failureAt` falls inside the rolling window
 *     (each no_match overwrites the entity's breadcrumb — one decline per
 *     entity per window, which is exactly the strike grain being guarded);
 *   - successes: `restaurant_metadata->'googlePlaces'->>'fetchedAt'` inside
 *     the window (a successful grounding stamps fetchedAt and DELETES the
 *     failure breadcrumb — mergePlaceMetadata's `extras === null` arm).
 *
 * Because the evidence is durable, the verdict survives worker restarts and
 * is shared by every process: a freshly booted sweep script reads the same
 * window the held worker read and refuses on its first entity.
 *
 * On trip: `enrichPlace` returns 'skipped' with GROUNDING_HOLD_SKIP_REASON
 * (no Places spend, no strike spend, the cohort keeps its retries) and emits
 * a critical ops alert. Batch drivers are the SECOND READER of the same
 * window: the sweep loop watches for that reason and HALTS by throwing
 * GroundingSweepHaltError, so a held lane stops a run loudly instead of
 * skipping hundreds of entities in silence. The hold is latched in-process
 * so the DB is not re-queried while held. Recovery is operator-shaped: fix
 * the root cause, void the strikes, restart after the window has aged out
 * (or clear the breadcrumbs via retryTerminal).
 *
 * Transient errors and skips count as neither (an outage is not a ruling).
 */

export const WORKER_LANE_MIN_ATTEMPTS = 20;
export const WORKER_LANE_MAX_DECLINE_RATE = 0.9;
export const WORKER_LANE_WINDOW_MINUTES = 120;
/** Re-read the window at most this often — one cheap aggregate per interval,
 *  not one per job at concurrency 5. */
export const WORKER_LANE_RECHECK_MS = 30_000;

/** The `reason` every hold-skipped enrichment result carries — the one
 *  string batch drivers read to turn a held lane into a halted run. */
export const GROUNDING_HOLD_SKIP_REASON = 'grounding_decline_hold';

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
    `GROUNDING LANE HELD: ${v.declines}/${v.attempts} completed ` +
    `attempts (${((100 * v.declines) / Math.max(v.attempts, 1)).toFixed(1)}%) ` +
    `in the trailing ${WORKER_LANE_WINDOW_MINUTES}-minute window came back ` +
    `no_match — above the ${(WORKER_LANE_MAX_DECLINE_RATE * 100).toFixed(0)}% ` +
    `bound. A decline rate this high across this many entities is a broken ` +
    `judge or broken candidate retrieval, not that many correct rejections ` +
    `(the 2026-08-20 sweep declined 716/716 including Rudys and Shake Shack ` +
    `and spent a permanent strike on each). Every grounding entry — worker ` +
    `jobs, the operator sweep, --entity= runs — is being skipped at the ` +
    `enrichPlace chokepoint; no further strikes or Places dollars are being ` +
    `spent. Fix the root cause, void this window's strikes, then restart ` +
    `after the window ages out (or clear via retryTerminal).`
  );
}

/**
 * What a batch driver throws when the shared hold trips mid-run: the run
 * stops, the operator is told loudly, and the remaining cohort keeps its
 * retries for after the root cause is fixed.
 */
export class GroundingSweepHaltError extends Error {
  constructor(
    public readonly attempts: number,
    public readonly declines: number,
  ) {
    super(
      `GROUNDING SWEEP HALTED: the shared grounding decline hold tripped — ` +
        workerLaneHoldMessage({ held: true, attempts, declines }),
    );
    this.name = 'GroundingSweepHaltError';
  }
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
