import type { RunOneHandoffPhase } from './run-one-handoff-phase';
import {
  createRunOneHandoffIdleSnapshot,
  createRunOneHandoffOperationSnapshot,
  createRunOneHandoffPublicSnapshot,
  resolveRunOneHandoffAdvanceSnapshot,
  resolveRunOneHandoffResetSnapshot,
} from './run-one-handoff-runtime';
import type {
  RunOneHandoffAdvanceMetadata,
  RunOneHandoffSnapshot,
} from './run-one-handoff-coordinator';

export type RunOneHandoffOwnerRuntime = {
  beginOperation: (operationId: string, seq: number, page: number) => RunOneHandoffSnapshot;
  advancePhase: (
    phase: RunOneHandoffPhase,
    metadata?: RunOneHandoffAdvanceMetadata
  ) => boolean;
  getSnapshot: () => RunOneHandoffSnapshot;
  reset: (operationId?: string) => boolean;
};

export const createRunOneHandoffOwnerRuntime = (): RunOneHandoffOwnerRuntime => {
  let snapshot: RunOneHandoffSnapshot = createRunOneHandoffIdleSnapshot();

  return {
    beginOperation: (operationId, seq, page) => {
      if (!operationId) {
        return createRunOneHandoffPublicSnapshot(snapshot);
      }
      snapshot = createRunOneHandoffOperationSnapshot({
        snapshot,
        operationId,
        seq,
        page,
      });
      return createRunOneHandoffPublicSnapshot(snapshot);
    },
    advancePhase: (phase, metadata) => {
      const next = resolveRunOneHandoffAdvanceSnapshot({
        snapshot,
        phase,
        metadata,
      });
      if (!next.accepted) {
        return false;
      }
      snapshot = next.snapshot;
      return true;
    },
    getSnapshot: () => createRunOneHandoffPublicSnapshot(snapshot),
    reset: (operationId) => {
      const next = resolveRunOneHandoffResetSnapshot({
        snapshot,
        operationId,
      });
      if (!next.accepted) {
        return false;
      }
      snapshot = next.snapshot;
      return true;
    },
  };
};
