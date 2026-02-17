import { FrameBudgetGovernor } from './frame-budget-governor';

export const RUNTIME_WORK_LANE_PRIORITY = {
  sheet_drag: 1,
  user_camera_gesture: 1,
  phase_a_commit: 2,
  selection_feedback: 3,
  phase_b_materialization: 4,
  overlay_shell_transition: 5,
  telemetry: 6,
} as const;

export type RuntimeWorkLane = keyof typeof RUNTIME_WORK_LANE_PRIORITY;
export type RuntimeWorkPhase = 'h1' | 'h2' | 'h3' | 'h4';

export type RuntimeWorkTask = {
  id: string;
  lane: RuntimeWorkLane;
  operationId?: string;
  phase?: RuntimeWorkPhase;
  estimatedCostMs?: number;
  run: () => void;
  createdAtMs: number;
  deferredFrameCount: number;
};

export type RuntimeWorkSchedulerDrainSnapshot = {
  executed: number;
  yielded: boolean;
  deferred: number;
};

export type RuntimeWorkSchedulerPressureSnapshot = {
  queueDepth: number;
  maxQueueDepth: number;
  frameCount: number;
  yieldCount: number;
  laneDeferrals: Partial<Record<RuntimeWorkLane, number>>;
  lastFrameSpentMs: number;
  lastFrameStartedAtMs: number | null;
  laneEstimatesMs: Partial<Record<RuntimeWorkLane, number>>;
};

const DEFAULT_LANE_ESTIMATED_COST_MS: Record<RuntimeWorkLane, number> = {
  sheet_drag: 1,
  user_camera_gesture: 1,
  phase_a_commit: 3,
  selection_feedback: 2,
  phase_b_materialization: 4,
  overlay_shell_transition: 5,
  telemetry: 1,
};

const MAX_DEFERRED_FRAMES_BY_LANE: Partial<Record<RuntimeWorkLane, number>> = {
  selection_feedback: 2,
  phase_b_materialization: 6,
  overlay_shell_transition: 8,
};
const STARVATION_OVERRIDE_DISABLED_LANES = new Set<RuntimeWorkLane>([
  'phase_a_commit',
  'selection_feedback',
  'phase_b_materialization',
  'overlay_shell_transition',
]);

const LANE_ESTIMATE_EMA_WEIGHT = 0.35;

const getNowMs = (): number =>
  typeof performance?.now === 'function' ? performance.now() : Date.now();

const sanitizeCostMs = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
};

const createTaskComparator = (left: RuntimeWorkTask, right: RuntimeWorkTask): number => {
  const lanePriorityDiff =
    RUNTIME_WORK_LANE_PRIORITY[left.lane] - RUNTIME_WORK_LANE_PRIORITY[right.lane];
  if (lanePriorityDiff !== 0) {
    return lanePriorityDiff;
  }
  return left.createdAtMs - right.createdAtMs;
};

export class RuntimeWorkScheduler {
  private queue: RuntimeWorkTask[] = [];
  private readonly laneEstimateMs = new Map<RuntimeWorkLane, number>();
  private frameLoopActive = false;
  private frameRequestId: number | null = null;
  private frameTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private maxQueueDepth = 0;

  constructor(private readonly governor: FrameBudgetGovernor = new FrameBudgetGovernor()) {
    (Object.keys(DEFAULT_LANE_ESTIMATED_COST_MS) as RuntimeWorkLane[]).forEach((lane) => {
      this.laneEstimateMs.set(lane, DEFAULT_LANE_ESTIMATED_COST_MS[lane]);
    });
  }

  public schedule(task: Omit<RuntimeWorkTask, 'createdAtMs' | 'deferredFrameCount'>): string {
    const queuedTask: RuntimeWorkTask = {
      ...task,
      estimatedCostMs: sanitizeCostMs(task.estimatedCostMs),
      createdAtMs: Date.now(),
      deferredFrameCount: 0,
    };
    this.queue.push(queuedTask);
    this.queue.sort(createTaskComparator);
    this.maxQueueDepth = Math.max(this.maxQueueDepth, this.queue.length);
    return queuedTask.id;
  }

  public startFrameLoop(): void {
    if (this.frameLoopActive) {
      return;
    }
    this.frameLoopActive = true;
    this.scheduleFrame();
  }

  public stopFrameLoop(): void {
    this.frameLoopActive = false;
    if (this.frameRequestId != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.frameRequestId);
      this.frameRequestId = null;
    }
    if (this.frameTimeoutHandle) {
      clearTimeout(this.frameTimeoutHandle);
      this.frameTimeoutHandle = null;
    }
  }

  public drainFrame(): RuntimeWorkSchedulerDrainSnapshot {
    this.governor.beginFrame(getNowMs());

    let executed = 0;
    let deferred = 0;
    let yielded = false;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) {
        break;
      }

      const laneEstimateMs = this.resolveLaneEstimate(task);
      const maxDeferredFrames = MAX_DEFERRED_FRAMES_BY_LANE[task.lane] ?? Number.POSITIVE_INFINITY;
      const starvationOverrideEligible = task.deferredFrameCount >= maxDeferredFrames;
      const canStarvationOverride =
        starvationOverrideEligible &&
        !this.governor.isCriticalPressure() &&
        !STARVATION_OVERRIDE_DISABLED_LANES.has(task.lane);
      const canRunTask = this.governor.canRun(task.lane, laneEstimateMs);

      if (!canRunTask && !canStarvationOverride) {
        task.deferredFrameCount += 1;
        this.governor.recordDeferral(task.lane);
        this.queue.unshift(task);
        deferred += 1;
        yielded = true;
        this.governor.recordYield();
        break;
      }

      const startedAtMs = getNowMs();
      try {
        task.run();
      } finally {
        const durationMs = Math.max(0, getNowMs() - startedAtMs);
        this.governor.recordRun(task.lane, durationMs);
        this.updateLaneEstimate(task.lane, durationMs, laneEstimateMs);
      }

      executed += 1;

      if (this.queue.length > 0 && this.governor.shouldYield()) {
        yielded = true;
        this.governor.recordYield();
        break;
      }
    }

    if (this.frameLoopActive) {
      if (this.queue.length > 0) {
        this.scheduleFrame();
      } else {
        this.stopFrameLoop();
      }
    }

    return {
      executed,
      yielded,
      deferred,
    };
  }

  public runNext(): RuntimeWorkTask | null {
    const nextTask = this.queue.shift();
    if (!nextTask) {
      return null;
    }
    const startedAtMs = getNowMs();
    nextTask.run();
    const durationMs = Math.max(0, getNowMs() - startedAtMs);
    const laneEstimateMs = this.resolveLaneEstimate(nextTask);
    this.updateLaneEstimate(nextTask.lane, durationMs, laneEstimateMs);
    return nextTask;
  }

  public runUntilEmpty(maxTasks = Number.POSITIVE_INFINITY): number {
    let executed = 0;
    while (executed < maxTasks && this.queue.length > 0) {
      const task = this.runNext();
      if (!task) {
        break;
      }
      executed += 1;
    }
    return executed;
  }

  public cancelByOperation(operationId: string): number {
    return this.cancelLaneTasksByOperation(operationId);
  }

  public cancelLaneTasksByOperation(operationId: string, lane?: RuntimeWorkLane): number {
    if (!operationId) {
      return 0;
    }
    const beforeCount = this.queue.length;
    this.queue = this.queue.filter((task) => {
      if (task.operationId !== operationId) {
        return true;
      }
      if (lane && task.lane !== lane) {
        return true;
      }
      return false;
    });
    return beforeCount - this.queue.length;
  }

  public clear(): void {
    this.stopFrameLoop();
    this.queue = [];
  }

  public resetPressureWindow(): void {
    this.maxQueueDepth = this.queue.length;
    this.governor.resetMetrics();
  }

  public snapshot(): readonly RuntimeWorkTask[] {
    return [...this.queue];
  }

  public snapshotPressure(): RuntimeWorkSchedulerPressureSnapshot {
    const governorSnapshot = this.governor.snapshot();
    const laneEstimatesMs = (Object.keys(RUNTIME_WORK_LANE_PRIORITY) as RuntimeWorkLane[]).reduce(
      (acc, lane) => {
        acc[lane] = this.resolveLaneEstimateByLane(lane);
        return acc;
      },
      {} as Partial<Record<RuntimeWorkLane, number>>
    );
    return {
      queueDepth: this.queue.length,
      maxQueueDepth: this.maxQueueDepth,
      frameCount: governorSnapshot.frameCount,
      yieldCount: governorSnapshot.yieldCount,
      laneDeferrals: governorSnapshot.laneDeferrals,
      lastFrameSpentMs: governorSnapshot.lastFrameSpentMs,
      lastFrameStartedAtMs: governorSnapshot.lastFrameStartedAtMs,
      laneEstimatesMs,
    };
  }

  private resolveLaneEstimate(task: RuntimeWorkTask): number {
    const explicitTaskEstimate = sanitizeCostMs(task.estimatedCostMs);
    if (explicitTaskEstimate > 0) {
      return explicitTaskEstimate;
    }
    return this.resolveLaneEstimateByLane(task.lane);
  }

  private resolveLaneEstimateByLane(lane: RuntimeWorkLane): number {
    return this.laneEstimateMs.get(lane) ?? DEFAULT_LANE_ESTIMATED_COST_MS[lane];
  }

  private updateLaneEstimate(
    lane: RuntimeWorkLane,
    durationMs: number,
    fallbackEstimateMs: number
  ): void {
    const observedCostMs = sanitizeCostMs(durationMs);
    const previousEstimateMs = this.resolveLaneEstimateByLane(lane) || fallbackEstimateMs;
    const nextEstimateMs =
      previousEstimateMs * (1 - LANE_ESTIMATE_EMA_WEIGHT) +
      observedCostMs * LANE_ESTIMATE_EMA_WEIGHT;
    this.laneEstimateMs.set(lane, sanitizeCostMs(nextEstimateMs));
  }

  private scheduleFrame(): void {
    if (!this.frameLoopActive) {
      return;
    }
    if (this.frameRequestId != null || this.frameTimeoutHandle) {
      return;
    }

    const runFrame = () => {
      this.frameRequestId = null;
      if (this.frameTimeoutHandle) {
        clearTimeout(this.frameTimeoutHandle);
        this.frameTimeoutHandle = null;
      }
      if (!this.frameLoopActive) {
        return;
      }
      this.drainFrame();
    };

    if (typeof requestAnimationFrame === 'function') {
      this.frameRequestId = requestAnimationFrame(() => {
        runFrame();
      });
      return;
    }
    this.frameTimeoutHandle = setTimeout(() => {
      runFrame();
    }, 0);
  }
}
