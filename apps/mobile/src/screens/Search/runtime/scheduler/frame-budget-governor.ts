import type { RuntimeWorkLane } from './runtime-work-scheduler';

type LaneDeferralSnapshot = Partial<Record<RuntimeWorkLane, number>>;

export type FrameBudgetGovernorSnapshot = {
  frameCount: number;
  yieldCount: number;
  laneDeferrals: LaneDeferralSnapshot;
  lastFrameSpentMs: number;
  lastFrameStartedAtMs: number | null;
};

const TARGET_FRAME_MS = 16.67;
const RESERVED_HEADROOM_MS = 4;
const SOFT_BUDGET_MS = 8;
const HARD_BUDGET_MS = 12;
const HEAVY_LANES = new Set<RuntimeWorkLane>([
  'phase_a_commit',
  'selection_feedback',
  'phase_b_materialization',
  'overlay_shell_transition',
]);

const sanitizeCost = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
};

export class FrameBudgetGovernor {
  private frameCount = 0;
  private yieldCount = 0;
  private laneDeferrals: LaneDeferralSnapshot = {};
  private currentFrameStartedAtMs: number | null = null;
  private currentFrameSpentMs = 0;
  private currentFrameHeavyLane: RuntimeWorkLane | null = null;
  private lastFrameSpentMs = 0;

  public beginFrame(frameStartMs: number): void {
    this.frameCount += 1;
    this.currentFrameStartedAtMs = Number.isFinite(frameStartMs) ? frameStartMs : Date.now();
    this.lastFrameSpentMs = this.currentFrameSpentMs;
    this.currentFrameSpentMs = 0;
    this.currentFrameHeavyLane = null;
  }

  public canRun(lane: RuntimeWorkLane, estimatedCostMs: number): boolean {
    if (HEAVY_LANES.has(lane) && this.currentFrameHeavyLane != null) {
      return false;
    }
    const nextCostMs = sanitizeCost(estimatedCostMs);
    const projectedSpentMs = this.currentFrameSpentMs + nextCostMs;
    const availableBudgetMs = Math.max(0, TARGET_FRAME_MS - RESERVED_HEADROOM_MS);
    const hasConsumedBudgetThisFrame = this.currentFrameSpentMs > 0;
    if (projectedSpentMs > HARD_BUDGET_MS) {
      return false;
    }
    // Soft budget is a multi-task admission guard. The first task in a frame may exceed
    // soft budget (up to hard/available budget) so heavy lanes do not starve indefinitely.
    if (projectedSpentMs > SOFT_BUDGET_MS && hasConsumedBudgetThisFrame) {
      return false;
    }
    return projectedSpentMs <= availableBudgetMs;
  }

  public recordRun(lane: RuntimeWorkLane, durationMs: number): void {
    if (HEAVY_LANES.has(lane) && this.currentFrameHeavyLane == null) {
      this.currentFrameHeavyLane = lane;
    }
    this.currentFrameSpentMs += sanitizeCost(durationMs);
  }

  public shouldYield(): boolean {
    if (this.currentFrameHeavyLane != null) {
      return true;
    }
    return this.currentFrameSpentMs >= SOFT_BUDGET_MS;
  }

  public recordYield(): void {
    this.yieldCount += 1;
  }

  public recordDeferral(lane: RuntimeWorkLane): void {
    this.laneDeferrals[lane] = (this.laneDeferrals[lane] ?? 0) + 1;
  }

  public resetMetrics(): void {
    this.frameCount = 0;
    this.yieldCount = 0;
    this.laneDeferrals = {};
    this.currentFrameStartedAtMs = null;
    this.currentFrameSpentMs = 0;
    this.currentFrameHeavyLane = null;
    this.lastFrameSpentMs = 0;
  }

  public isCriticalPressure(): boolean {
    return this.lastFrameSpentMs >= HARD_BUDGET_MS;
  }

  public snapshot(): FrameBudgetGovernorSnapshot {
    return {
      frameCount: this.frameCount,
      yieldCount: this.yieldCount,
      laneDeferrals: { ...this.laneDeferrals },
      lastFrameSpentMs: this.lastFrameSpentMs,
      lastFrameStartedAtMs: this.currentFrameStartedAtMs,
    };
  }
}

export const createFrameBudgetGovernor = (): FrameBudgetGovernor => new FrameBudgetGovernor();
