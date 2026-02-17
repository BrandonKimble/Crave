import { InteractionManager } from 'react-native';
import type { SearchResponseEnvelope } from '../adapters/search-response-envelope';
import { RuntimeWorkScheduler } from './runtime-work-scheduler';

export type PhaseBMaterializeInput = {
  operationId: string;
  envelope: SearchResponseEnvelope;
  sliceCount?: number;
  onSlice?: (input: {
    sliceIndex: number;
    totalSlices: number;
    operationId: string;
    envelope: SearchResponseEnvelope;
  }) => void;
};

export type PhaseBHydrationSyncInput = {
  operationId: string;
  pendingHydrationKey: string | null;
  hydratedHydrationKey: string | null;
  activeOverlayKey: string;
  commitHydrationKey: (nextHydrationKey: string | null) => void;
  onFinalizeKeyCommitted?: (hydrationKey: string) => void;
  onFinalizeRowsReleaseReady?: (hydrationKey: string) => void;
};

export type PhaseBHydrationRampInput = {
  operationId: string;
  initialRows: number;
  targetRows: number;
  stepRows?: number;
  frameBudgetMs?: number;
  resolveStepRows?: (input: {
    pressure: HydrationRampPressure;
    frameIndex: number;
    defaultStepRows: number;
  }) => number;
  onStep: (nextRowLimit: number) => void;
  onComplete?: () => void;
};

export type PhaseBHydrationFinalizeKeyCommitInput = {
  operationId: string;
  syncToken: string;
  commit: () => void;
  onCommitted?: () => void;
};

export type PhaseBHydrationFinalizeRowsReleaseInput = {
  operationId: string;
  syncToken: string;
  release: () => void;
};

export type HydrationRampPressure = 'healthy' | 'pressured' | 'critical';

const getNowMs = (): number => {
  if (typeof performance?.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const HYDRATION_PRESSURE_SOFT_BUDGET_MS = 8;
const HYDRATION_PRESSURE_HARD_BUDGET_MS = 12;
const HYDRATION_PRESSURE_MAX_QUEUE_DEPTH = 2;

export class PhaseBMaterializer {
  private hydrationTask: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
  private hydrationAnimationFrame: number | null = null;
  private hydrationFinalizeRowsReleaseAnimationFrame: number | null = null;
  private hydrationFinalizeRowsReleaseTimeout: ReturnType<typeof setTimeout> | null = null;
  private hydrationRampTask: ReturnType<typeof InteractionManager.runAfterInteractions> | null =
    null;
  private hydrationRampAnimationFrame: number | null = null;
  private hydrationRampTimeout: ReturnType<typeof setTimeout> | null = null;
  private hydrationRampToken: string | null = null;
  private hydrationSyncOperationId: string | null = null;
  private hydrationSyncToken: string | null = null;

  constructor(private readonly scheduler: RuntimeWorkScheduler) {}

  public schedule(input: PhaseBMaterializeInput): string[] {
    const totalSlices = Math.max(1, input.sliceCount ?? 1);
    const taskIds: string[] = [];
    for (let sliceIndex = 1; sliceIndex <= totalSlices; sliceIndex += 1) {
      const taskId = `${input.operationId}:phase-b:${sliceIndex}`;
      this.scheduler.schedule({
        id: taskId,
        lane: 'phase_b_materialization',
        operationId: input.operationId,
        run: () => {
          input.onSlice?.({
            sliceIndex,
            totalSlices,
            operationId: input.operationId,
            envelope: input.envelope,
          });
        },
      });
      taskIds.push(taskId);
    }
    return taskIds;
  }

  public cancel(operationId: string): number {
    return this.scheduler.cancelByOperation(operationId);
  }

  public syncHydrationCommit(input: PhaseBHydrationSyncInput): () => void {
    if (!input.pendingHydrationKey) {
      this.resetHydrationSyncIdentity();
      this.cancelHydrationCommit();
      this.cancelHydrationFinalizeRowsRelease();
      this.cancelHydrationRamp();
      if (input.hydratedHydrationKey !== null) {
        input.commitHydrationKey(null);
      }
      return () => {
        this.cancelHydrationCommit();
        this.cancelHydrationFinalizeRowsRelease();
        this.cancelHydrationRamp();
      };
    }

    if (input.pendingHydrationKey === input.hydratedHydrationKey) {
      // The key commit may have just completed and caused the caller effect to re-run.
      // Ensure rows-release is still signaled even if the previous async release callback
      // was cancelled during cleanup on that re-run.
      input.onFinalizeRowsReleaseReady?.(input.pendingHydrationKey);
      this.resetHydrationSyncIdentity();
      this.cancelHydrationCommit();
      this.cancelHydrationFinalizeRowsRelease();
      return () => {
        this.cancelHydrationCommit();
        this.cancelHydrationFinalizeRowsRelease();
      };
    }

    this.cancelHydrationRamp();
    this.cancelHydrationFinalizeRowsRelease();
    const hydrationKey = input.pendingHydrationKey;
    const syncToken = `${input.operationId}:phase-b-hydration-sync:${Date.now().toString(36)}`;
    this.hydrationSyncOperationId = input.operationId;
    this.hydrationSyncToken = syncToken;

    if (input.activeOverlayKey !== 'search') {
      this.commitHydrationImmediately({
        operationId: input.operationId,
        nextHydrationKey: hydrationKey,
        commitHydrationKey: input.commitHydrationKey,
      });
      input.onFinalizeKeyCommitted?.(hydrationKey);
      input.onFinalizeRowsReleaseReady?.(hydrationKey);
      return () => {
        this.cancelHydrationCommit();
        this.cancelHydrationFinalizeRowsRelease();
      };
    }

    this.scheduleHydrationFinalizeKeyCommit({
      operationId: input.operationId,
      syncToken,
      commit: () => {
        input.commitHydrationKey(hydrationKey);
      },
      onCommitted: () => {
        input.onFinalizeKeyCommitted?.(hydrationKey);
        this.scheduleHydrationFinalizeRowsRelease({
          operationId: input.operationId,
          syncToken,
          release: () => {
            input.onFinalizeRowsReleaseReady?.(hydrationKey);
          },
        });
      },
    });
    return () => {
      this.cancelHydrationCommit();
      this.cancelHydrationFinalizeRowsRelease();
    };
  }

  public commitHydrationImmediately(input: {
    operationId: string;
    nextHydrationKey: string;
    commitHydrationKey: (nextHydrationKey: string) => void;
  }): void {
    this.resetHydrationSyncIdentity();
    this.scheduler.cancelLaneTasksByOperation(input.operationId, 'phase_b_materialization');
    this.cancelHydrationCommit();
    this.cancelHydrationRamp();
    input.commitHydrationKey(input.nextHydrationKey);
  }

  public resetHydrationCommit(): void {
    this.resetHydrationSyncIdentity();
    this.cancelHydrationCommit();
    this.cancelHydrationFinalizeRowsRelease();
  }

  private scheduleHydrationFinalizeKeyCommit(input: PhaseBHydrationFinalizeKeyCommitInput): string {
    return this.scheduleHydrationCommit(input);
  }

  private scheduleHydrationCommit(input: PhaseBHydrationFinalizeKeyCommitInput): string {
    this.cancelHydrationCommit();

    const taskId = `${input.operationId}:phase-b:hydration-finalize-key-commit`;
    this.scheduler.schedule({
      id: taskId,
      lane: 'phase_b_materialization',
      operationId: input.operationId,
      run: () => {
        if (!this.isHydrationSyncActive(input.operationId, input.syncToken)) {
          return;
        }
        this.hydrationTask = InteractionManager.runAfterInteractions(() => {
          this.hydrationTask = null;
          const executeCommit = () => {
            if (!this.isHydrationSyncActive(input.operationId, input.syncToken)) {
              return;
            }
            input.commit();
            input.onCommitted?.();
          };
          if (typeof requestAnimationFrame === 'function') {
            this.hydrationAnimationFrame = requestAnimationFrame(() => {
              this.hydrationAnimationFrame = null;
              executeCommit();
            });
            return;
          }
          executeCommit();
        });
      },
    });
    this.scheduler.startFrameLoop();
    return taskId;
  }

  public scheduleHydrationFinalizeRowsRelease(
    input: PhaseBHydrationFinalizeRowsReleaseInput
  ): string {
    this.cancelHydrationFinalizeRowsRelease();

    const taskId = `${input.operationId}:phase-b:hydration-finalize-rows-release`;
    this.scheduler.schedule({
      id: taskId,
      lane: 'phase_b_materialization',
      operationId: input.operationId,
      run: () => {
        if (!this.isHydrationSyncActive(input.operationId, input.syncToken)) {
          return;
        }
        if (typeof requestAnimationFrame === 'function') {
          this.hydrationFinalizeRowsReleaseAnimationFrame = requestAnimationFrame(() => {
            this.hydrationFinalizeRowsReleaseAnimationFrame = null;
            if (!this.isHydrationSyncActive(input.operationId, input.syncToken)) {
              return;
            }
            input.release();
          });
          return;
        }
        this.hydrationFinalizeRowsReleaseTimeout = setTimeout(() => {
          this.hydrationFinalizeRowsReleaseTimeout = null;
          if (!this.isHydrationSyncActive(input.operationId, input.syncToken)) {
            return;
          }
          input.release();
        }, 0);
      },
    });
    this.scheduler.startFrameLoop();
    return taskId;
  }

  public scheduleHydrationRamp(input: PhaseBHydrationRampInput): () => void {
    this.cancelHydrationRamp();

    const targetRows = Math.max(0, Math.floor(input.targetRows));
    let currentRows = Math.max(0, Math.min(Math.floor(input.initialRows), targetRows));
    const stepRows = Math.max(1, Math.floor(input.stepRows ?? 4));
    const frameBudgetMs = Math.max(1, Number(input.frameBudgetMs ?? 4));
    let frameIndex = 0;
    let lastYieldCount = this.scheduler.snapshotPressure().yieldCount;
    let consecutiveYieldFrames = 0;

    const resolvePressure = (): HydrationRampPressure => {
      const snapshot = this.scheduler.snapshotPressure();
      const yieldDelta = Math.max(0, snapshot.yieldCount - lastYieldCount);
      lastYieldCount = snapshot.yieldCount;
      if (yieldDelta > 0) {
        consecutiveYieldFrames += 1;
      } else {
        consecutiveYieldFrames = 0;
      }

      if (
        snapshot.lastFrameSpentMs > HYDRATION_PRESSURE_HARD_BUDGET_MS ||
        consecutiveYieldFrames >= 2
      ) {
        return 'critical';
      }
      if (
        snapshot.lastFrameSpentMs > HYDRATION_PRESSURE_SOFT_BUDGET_MS ||
        snapshot.queueDepth > HYDRATION_PRESSURE_MAX_QUEUE_DEPTH ||
        yieldDelta > 0
      ) {
        return 'pressured';
      }
      return 'healthy';
    };

    input.onStep(currentRows);
    if (currentRows >= targetRows) {
      input.onComplete?.();
      return () => undefined;
    }

    const token = `${input.operationId}:${Date.now()}`;
    this.hydrationRampToken = token;

    const runFrame = () => {
      if (this.hydrationRampToken !== token) {
        return;
      }

      const frameStartedAtMs = getNowMs();
      const pressure = resolvePressure();
      const pressureDefaultStepRows =
        pressure === 'critical' ? 1 : pressure === 'pressured' ? 2 : stepRows;
      const resolvedStepRows = Math.max(
        1,
        Math.floor(
          input.resolveStepRows?.({
            pressure,
            frameIndex,
            defaultStepRows: pressureDefaultStepRows,
          }) ?? pressureDefaultStepRows
        )
      );
      frameIndex += 1;
      const nextRows = Math.min(targetRows, currentRows + resolvedStepRows);
      if (nextRows > currentRows) {
        currentRows = nextRows;
        input.onStep(currentRows);
      }

      if (currentRows >= targetRows) {
        this.cancelHydrationRamp();
        input.onComplete?.();
        return;
      }

      if (getNowMs() - frameStartedAtMs > frameBudgetMs) {
        // Continue on next frame; one-step scheduling keeps hydration burst bounded.
      }

      if (typeof requestAnimationFrame === 'function') {
        this.hydrationRampAnimationFrame = requestAnimationFrame(runFrame);
        return;
      }
      this.hydrationRampTimeout = setTimeout(runFrame, 0);
    };

    this.hydrationRampTask = InteractionManager.runAfterInteractions(() => {
      this.hydrationRampTask = null;
      if (typeof requestAnimationFrame === 'function') {
        this.hydrationRampAnimationFrame = requestAnimationFrame(runFrame);
        return;
      }
      this.hydrationRampTimeout = setTimeout(runFrame, 0);
    });

    return () => {
      if (this.hydrationRampToken === token) {
        this.cancelHydrationRamp();
      }
    };
  }

  public resetHydrationRamp(): void {
    this.cancelHydrationRamp();
  }

  private cancelHydrationCommit(): void {
    if (this.hydrationTask) {
      this.hydrationTask.cancel();
      this.hydrationTask = null;
    }
    if (this.hydrationAnimationFrame != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.hydrationAnimationFrame);
      this.hydrationAnimationFrame = null;
    }
  }

  private cancelHydrationFinalizeRowsRelease(): void {
    if (
      this.hydrationFinalizeRowsReleaseAnimationFrame != null &&
      typeof cancelAnimationFrame === 'function'
    ) {
      cancelAnimationFrame(this.hydrationFinalizeRowsReleaseAnimationFrame);
      this.hydrationFinalizeRowsReleaseAnimationFrame = null;
    }
    if (this.hydrationFinalizeRowsReleaseTimeout) {
      clearTimeout(this.hydrationFinalizeRowsReleaseTimeout);
      this.hydrationFinalizeRowsReleaseTimeout = null;
    }
  }

  private cancelHydrationRamp(): void {
    if (this.hydrationRampTask) {
      this.hydrationRampTask.cancel();
      this.hydrationRampTask = null;
    }
    if (this.hydrationRampAnimationFrame != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.hydrationRampAnimationFrame);
      this.hydrationRampAnimationFrame = null;
    }
    if (this.hydrationRampTimeout) {
      clearTimeout(this.hydrationRampTimeout);
      this.hydrationRampTimeout = null;
    }
    this.hydrationRampToken = null;
  }

  private resetHydrationSyncIdentity(): void {
    this.hydrationSyncOperationId = null;
    this.hydrationSyncToken = null;
  }

  private isHydrationSyncActive(operationId: string, syncToken: string): boolean {
    return (
      this.hydrationSyncOperationId === operationId &&
      this.hydrationSyncToken != null &&
      this.hydrationSyncToken === syncToken
    );
  }
}

export const createPhaseBMaterializer = (
  scheduler = new RuntimeWorkScheduler()
): PhaseBMaterializer => new PhaseBMaterializer(scheduler);
