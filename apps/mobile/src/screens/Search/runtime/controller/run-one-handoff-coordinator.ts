import type { RunOneHandoffPhase } from './run-one-handoff-phase';
import {
  createRunOneHandoffOwnerRuntime,
  type RunOneHandoffOwnerRuntime,
} from './run-one-handoff-owner-runtime';

type RunOneHandoffCoordinatorListener = (snapshot: RunOneHandoffSnapshot) => void;

export type RunOneHandoffAdvanceMetadata = {
  operationId?: string | null;
  requestKey?: string | null;
  markerEnterCommitId?: number | null;
  markerEnterSettledAtMs?: number | null;
  markerEnterSettled?: boolean;
  [key: string]: unknown;
};

export type RunOneHandoffSnapshot = {
  sessionId: string;
  operationId: string | null;
  seq: number | null;
  page: number | null;
  phase: RunOneHandoffPhase;
  markerEnterSettledAtMs: number | null;
  metadata: Readonly<Record<string, unknown>>;
  updatedAtMs: number;
};

export class RunOneHandoffCoordinator {
  private readonly listeners = new Set<RunOneHandoffCoordinatorListener>();

  private readonly ownerRuntime: RunOneHandoffOwnerRuntime =
    createRunOneHandoffOwnerRuntime();

  public beginOperation(operationId: string, seq: number, page: number): RunOneHandoffSnapshot {
    const previousSnapshot = this.getSnapshot();
    const nextSnapshot = this.ownerRuntime.beginOperation(operationId, seq, page);
    if (nextSnapshot === previousSnapshot) {
      return previousSnapshot;
    }
    this.notify();
    return nextSnapshot;
  }

  public advancePhase(phase: RunOneHandoffPhase, metadata?: RunOneHandoffAdvanceMetadata): boolean {
    if (!this.ownerRuntime.advancePhase(phase, metadata)) {
      return false;
    }
    this.notify();
    return true;
  }

  public getSnapshot(): RunOneHandoffSnapshot {
    return this.ownerRuntime.getSnapshot();
  }

  public subscribe(listener: RunOneHandoffCoordinatorListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public reset(operationId?: string): boolean {
    if (!this.ownerRuntime.reset(operationId)) {
      return false;
    }
    this.notify();
    return true;
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const createRunOneHandoffCoordinator = (): RunOneHandoffCoordinator =>
  new RunOneHandoffCoordinator();
