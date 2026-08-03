import { FrameBudgetGovernor } from './frame-budget-governor';
import { RuntimeWorkScheduler, type RuntimeWorkLane } from './runtime-work-scheduler';

/**
 * The governor measures REAL elapsed time via performance.now/Date.now, which a
 * hermetic spec cannot spend. These tests therefore drive the governor directly for the
 * budget arithmetic, and drive the scheduler with tasks that report their cost through
 * `recordRun` on a governor stub for the queue/fairness behavior.
 */
class ScriptedGovernor extends FrameBudgetGovernor {
  public constructor(private readonly costByTaskLaneMs: Partial<Record<RuntimeWorkLane, number>>) {
    super();
  }

  public override recordRun(lane: RuntimeWorkLane): void {
    super.recordRun(lane, this.costByTaskLaneMs[lane] ?? 0);
  }
}

const scheduleTask = (
  scheduler: RuntimeWorkScheduler,
  id: string,
  lane: RuntimeWorkLane,
  ran: string[]
): void => {
  scheduler.schedule({
    id,
    lane,
    run: () => {
      ran.push(id);
    },
  });
};

describe('FrameBudgetGovernor admission', () => {
  it('admits the first task of a frame even past the soft budget, up to the hard budget', () => {
    const governor = new FrameBudgetGovernor();
    governor.beginFrame(0);
    expect(governor.canRun('telemetry', 9)).toBe(true);
    expect(governor.canRun('telemetry', 12)).toBe(true);
    expect(governor.canRun('telemetry', 12.5)).toBe(false);
  });

  it('refuses a second task that would cross the soft budget', () => {
    const governor = new FrameBudgetGovernor();
    governor.beginFrame(0);
    governor.recordRun('telemetry', 5);
    expect(governor.canRun('telemetry', 3)).toBe(true);
    expect(governor.canRun('telemetry', 3.5)).toBe(false);
  });

  it('admits at most one heavy lane per frame', () => {
    const governor = new FrameBudgetGovernor();
    governor.beginFrame(0);
    expect(governor.canRun('phase_b_materialization', 1)).toBe(true);
    governor.recordRun('phase_b_materialization', 1);
    expect(governor.canRun('overlay_shell_transition', 1)).toBe(false);
    expect(governor.canRun('phase_b_materialization', 1)).toBe(false);
    // A light lane is still admissible within budget.
    expect(governor.canRun('telemetry', 1)).toBe(true);
  });

  it('yields for the rest of the frame once a heavy lane has run', () => {
    const governor = new FrameBudgetGovernor();
    governor.beginFrame(0);
    expect(governor.shouldYield()).toBe(false);
    governor.recordRun('selection_feedback', 0);
    expect(governor.shouldYield()).toBe(true);
  });

  it('treats a negative or non-finite cost as zero rather than a budget credit', () => {
    const governor = new FrameBudgetGovernor();
    governor.beginFrame(0);
    governor.recordRun('telemetry', Number.NaN);
    governor.recordRun('telemetry', -100);
    expect(governor.canRun('telemetry', 12)).toBe(true);
  });
});

describe('RuntimeWorkScheduler fairness without a starvation override', () => {
  it('keeps a deferred task at the HEAD of the queue, ahead of lower-priority work', () => {
    const ran: string[] = [];
    const scheduler = new RuntimeWorkScheduler(new ScriptedGovernor({}));
    // An estimate above the hard budget can never be admitted: the ONLY thing standing
    // between this task and permanent starvation is head-retention, now that the
    // (always-false) starvation override is gone. If a deferral sent the task to the
    // back, the lower-priority telemetry task would overtake it.
    scheduler.schedule({
      id: 'oversized-commit',
      lane: 'phase_a_commit',
      estimatedCostMs: 13,
      run: () => ran.push('oversized-commit'),
    });
    scheduleTask(scheduler, 'telemetry', 'telemetry', ran);

    const frame = scheduler.drainFrame();
    expect(frame.executed).toBe(0);
    expect(frame.deferred).toBe(1);
    expect(ran).toEqual([]);
    expect(scheduler.snapshot().map((task) => task.id)).toEqual(['oversized-commit', 'telemetry']);

    scheduler.drainFrame();
    expect(scheduler.snapshot()[0]?.id).toBe('oversized-commit');
    expect(scheduler.snapshotPressure().laneDeferrals.phase_a_commit).toBe(2);
  });

  it('runs a deferred task first on the next frame once the budget allows it', () => {
    const ran: string[] = [];
    const scheduler = new RuntimeWorkScheduler(
      new ScriptedGovernor({ phase_a_commit: 12, phase_b_materialization: 0, telemetry: 0 })
    );
    scheduleTask(scheduler, 'commit', 'phase_a_commit', ran);
    scheduleTask(scheduler, 'materialize', 'phase_b_materialization', ran);
    scheduleTask(scheduler, 'telemetry', 'telemetry', ran);

    const firstFrame = scheduler.drainFrame();
    expect(ran).toEqual(['commit']);
    expect(firstFrame.yielded).toBe(true);

    scheduler.drainFrame();
    expect(ran).toEqual(['commit', 'materialize']);

    scheduler.drainFrame();
    expect(ran).toEqual(['commit', 'materialize', 'telemetry']);
  });

  it('counts a deferral in the pressure snapshot so starvation is observable', () => {
    const ran: string[] = [];
    const scheduler = new RuntimeWorkScheduler(new ScriptedGovernor({ phase_a_commit: 12 }));
    scheduleTask(scheduler, 'commit', 'phase_a_commit', ran);
    scheduleTask(scheduler, 'commit-2', 'phase_a_commit', ran);

    scheduler.drainFrame();
    const pressure = scheduler.snapshotPressure();
    expect(pressure.queueDepth).toBe(1);
    expect(pressure.yieldCount).toBeGreaterThan(0);
  });

  it('drops cancelled tasks by operation without disturbing the rest of the queue', () => {
    const ran: string[] = [];
    const scheduler = new RuntimeWorkScheduler(new ScriptedGovernor({}));
    scheduler.schedule({ id: 'a', lane: 'telemetry', operationId: 'op', run: () => ran.push('a') });
    scheduleTask(scheduler, 'b', 'telemetry', ran);

    expect(scheduler.cancelByOperation('op')).toBe(1);
    scheduler.runUntilEmpty();
    expect(ran).toEqual(['b']);
  });
});
