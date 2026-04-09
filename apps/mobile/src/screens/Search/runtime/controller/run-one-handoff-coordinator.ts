import { RUN_ONE_HANDOFF_PHASE_ORDER, type RunOneHandoffPhase } from './run-one-handoff-phase';

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

const phaseIndexByName = RUN_ONE_HANDOFF_PHASE_ORDER.reduce(
  (map, phase, index) => map.set(phase, index),
  new Map<RunOneHandoffPhase, number>()
);

const nowMs = (): number =>
  typeof performance?.now === 'function' ? performance.now() : Date.now();

const cloneMetadata = (value: Record<string, unknown>): Readonly<Record<string, unknown>> => ({
  ...value,
});

const createSessionId = (): string =>
  `run1-handoff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class RunOneHandoffCoordinator {
  private readonly listeners = new Set<RunOneHandoffCoordinatorListener>();

  private snapshot: RunOneHandoffSnapshot = {
    sessionId: createSessionId(),
    operationId: null,
    seq: null,
    page: null,
    phase: 'idle',
    markerEnterSettledAtMs: null,
    metadata: {},
    updatedAtMs: nowMs(),
  };

  public beginOperation(operationId: string, seq: number, page: number): RunOneHandoffSnapshot {
    if (!operationId) {
      return this.getSnapshot();
    }
    this.snapshot = {
      sessionId: this.snapshot.sessionId,
      operationId,
      seq,
      page,
      phase: 'idle',
      markerEnterSettledAtMs: null,
      metadata: {},
      updatedAtMs: nowMs(),
    };
    this.notify();
    return this.getSnapshot();
  }

  public advancePhase(phase: RunOneHandoffPhase, metadata?: RunOneHandoffAdvanceMetadata): boolean {
    const activeOperationId = this.snapshot.operationId;
    const metadataOperationId = metadata?.operationId ?? null;

    if (metadataOperationId && activeOperationId && metadataOperationId !== activeOperationId) {
      return false;
    }

    if (!activeOperationId && phase !== 'idle') {
      return false;
    }

    const previousPhase = this.snapshot.phase;
    const previousIndex = phaseIndexByName.get(previousPhase) ?? 0;
    const nextIndex = phaseIndexByName.get(phase) ?? 0;

    if (phase !== previousPhase) {
      if (nextIndex < previousIndex || nextIndex > previousIndex + 1) {
        return false;
      }
    }

    const markerEnterSettledAtMs = metadata?.markerEnterSettled
      ? metadata?.markerEnterSettledAtMs ?? nowMs()
      : this.snapshot.markerEnterSettledAtMs;
    const nextMetadata: Record<string, unknown> = {
      ...this.snapshot.metadata,
      ...(metadata ?? {}),
    };

    if (phase === 'idle') {
      this.snapshot = {
        ...this.snapshot,
        operationId: null,
        seq: null,
        page: null,
        phase: 'idle',
        markerEnterSettledAtMs: null,
        metadata: {},
        updatedAtMs: nowMs(),
      };
      this.notify();
      return true;
    }

    this.snapshot = {
      ...this.snapshot,
      phase,
      markerEnterSettledAtMs,
      metadata: cloneMetadata(nextMetadata),
      updatedAtMs: nowMs(),
    };
    this.notify();
    return true;
  }

  public getSnapshot(): RunOneHandoffSnapshot {
    return {
      ...this.snapshot,
      metadata: cloneMetadata(this.snapshot.metadata as Record<string, unknown>),
    };
  }

  public subscribe(listener: RunOneHandoffCoordinatorListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public reset(operationId?: string): boolean {
    if (operationId && this.snapshot.operationId && operationId !== this.snapshot.operationId) {
      return false;
    }
    this.snapshot = {
      ...this.snapshot,
      operationId: null,
      seq: null,
      page: null,
      phase: 'idle',
      markerEnterSettledAtMs: null,
      metadata: {},
      updatedAtMs: nowMs(),
    };
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
