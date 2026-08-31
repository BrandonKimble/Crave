/**
 * THE WORKER-LANE DECLINE ALARM, proven on the 08-20 shape (W1).
 *
 * The scenario under test is the disease itself: a stream of mention-driven
 * worker jobs, each its own "run", every one declined by a broken chooser.
 * The simulated lane writes the same durable evidence the real lane writes
 * (a no_match breadcrumb per decline, a fetchedAt stamp per success) and
 * the alarm judges ONLY from that window — so the spec exercises the exact
 * mechanism that survives a worker restart.
 */
import {
  WorkerLaneDeclineAlarm,
  WORKER_LANE_MIN_ATTEMPTS,
  workerLaneHoldMessage,
  type WorkerLaneWindowCounts,
} from './worker-lane-decline-alarm';

/** A simulated durable window: what the breadcrumbs would show. */
class SimulatedLane {
  declines = 0;
  successes = 0;
  reads = 0;

  readCounts = (): Promise<WorkerLaneWindowCounts> => {
    this.reads += 1;
    return Promise.resolve({
      declines: this.declines,
      successes: this.successes,
    });
  };
}

describe('WorkerLaneDeclineAlarm', () => {
  it('trips RED on the 08-20 shape: a run of worker jobs declining 100% holds the lane before the cohort is spent', async () => {
    const lane = new SimulatedLane();
    // recheckMs 0 = re-read the durable window on every job, so the spec
    // pins exactly which job count trips.
    const alarm = new WorkerLaneDeclineAlarm(undefined, undefined, 0);

    let heldAtAttempt: number | null = null;
    // The 08-20 run was 716 entities; the alarm must fire orders of
    // magnitude earlier.
    for (let job = 1; job <= 716; job += 1) {
      const verdict = await alarm.evaluate(lane.readCounts);
      if (verdict.held) {
        heldAtAttempt = lane.declines;
        break;
      }
      // Job runs, chooser declines, lane writes its durable breadcrumb.
      lane.declines += 1;
    }

    expect(heldAtAttempt).not.toBeNull();
    expect(heldAtAttempt).toBe(WORKER_LANE_MIN_ATTEMPTS);
    // 716 - 20 = 696 strikes NOT spent.
    expect(lane.declines).toBeLessThan(30);
  });

  it('stays held once tripped (fail-closed latch, no further window reads)', async () => {
    const lane = new SimulatedLane();
    lane.declines = 25;
    const alarm = new WorkerLaneDeclineAlarm(undefined, undefined, 0);
    expect((await alarm.evaluate(lane.readCounts)).held).toBe(true);
    const readsAtTrip = lane.reads;
    // Even if the window later looks healthy, the in-process latch holds —
    // recovery is operator-shaped, not drift-shaped.
    lane.declines = 0;
    lane.successes = 100;
    expect((await alarm.evaluate(lane.readCounts)).held).toBe(true);
    expect(lane.reads).toBe(readsAtTrip);
  });

  it('a restarted worker re-trips from the durable window alone', async () => {
    const lane = new SimulatedLane();
    lane.declines = 30;
    lane.successes = 1;
    // Fresh instance = process restart; no in-memory state carried over.
    const rebooted = new WorkerLaneDeclineAlarm(undefined, undefined, 0);
    expect((await rebooted.evaluate(lane.readCounts)).held).toBe(true);
  });

  it('does not trip a healthy lane, a small sample, or a mixed lane at the bound', async () => {
    const healthy = new SimulatedLane();
    healthy.declines = 10;
    healthy.successes = 90;
    const a1 = new WorkerLaneDeclineAlarm(undefined, undefined, 0);
    expect((await a1.evaluate(healthy.readCounts)).held).toBe(false);

    const small = new SimulatedLane();
    small.declines = WORKER_LANE_MIN_ATTEMPTS - 1; // 100% but under min
    const a2 = new WorkerLaneDeclineAlarm(undefined, undefined, 0);
    expect((await a2.evaluate(small.readCounts)).held).toBe(false);

    const atBound = new SimulatedLane();
    atBound.declines = 90;
    atBound.successes = 10; // exactly 0.9, not OVER the bound
    const a3 = new WorkerLaneDeclineAlarm(undefined, undefined, 0);
    expect((await a3.evaluate(atBound.readCounts)).held).toBe(false);
  });

  it('caches the window read between jobs (one aggregate per interval, not per job)', async () => {
    const lane = new SimulatedLane();
    lane.successes = 50;
    const alarm = new WorkerLaneDeclineAlarm(undefined, undefined, 30_000);
    await alarm.evaluate(lane.readCounts, 1_000);
    await alarm.evaluate(lane.readCounts, 2_000);
    await alarm.evaluate(lane.readCounts, 10_000);
    expect(lane.reads).toBe(1);
    await alarm.evaluate(lane.readCounts, 40_000);
    expect(lane.reads).toBe(2);
  });

  it('the hold message tells the operator the rate, the bound, and the recovery path', () => {
    const message = workerLaneHoldMessage({
      held: true,
      attempts: 25,
      declines: 25,
    });
    expect(message).toContain('25/25');
    expect(message).toContain('no further strikes');
    expect(message).toContain('retryTerminal');
  });
});
