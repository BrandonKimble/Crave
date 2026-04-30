import {
  RUN_ONE_HANDOFF_PHASE_ORDER,
  type RunOneHandoffPhase,
} from './run-one-handoff-phase';
import type {
  RunOneHandoffAdvanceMetadata,
  RunOneHandoffSnapshot,
} from './run-one-handoff-coordinator';
import {
  cloneRunOneHandoffMetadata,
  createRunOneHandoffIdleSnapshot,
  getRunOneHandoffNowMs,
} from './run-one-handoff-snapshot-runtime';

const phaseIndexByName = RUN_ONE_HANDOFF_PHASE_ORDER.reduce(
  (map, phase, index) => map.set(phase, index),
  new Map<RunOneHandoffPhase, number>()
);

export const resolveRunOneHandoffAdvanceSnapshot = ({
  snapshot,
  phase,
  metadata,
}: {
  snapshot: RunOneHandoffSnapshot;
  phase: RunOneHandoffPhase;
  metadata?: RunOneHandoffAdvanceMetadata;
}): {
  accepted: boolean;
  snapshot: RunOneHandoffSnapshot;
} => {
  const activeOperationId = snapshot.operationId;
  const metadataOperationId = metadata?.operationId ?? null;

  if (
    metadataOperationId &&
    activeOperationId &&
    metadataOperationId !== activeOperationId
  ) {
    return { accepted: false, snapshot };
  }

  if (!activeOperationId && phase !== 'idle') {
    return { accepted: false, snapshot };
  }

  const previousPhase = snapshot.phase;
  const previousIndex = phaseIndexByName.get(previousPhase) ?? 0;
  const nextIndex = phaseIndexByName.get(phase) ?? 0;

  if (
    phase !== previousPhase &&
    (nextIndex < previousIndex || nextIndex > previousIndex + 1)
  ) {
    return { accepted: false, snapshot };
  }

  if (phase === 'idle') {
    return {
      accepted: true,
      snapshot: createRunOneHandoffIdleSnapshot(snapshot.sessionId),
    };
  }

  const markerEnterSettledAtMs = metadata?.markerEnterSettled
    ? metadata?.markerEnterSettledAtMs ?? getRunOneHandoffNowMs()
    : snapshot.markerEnterSettledAtMs;

  return {
    accepted: true,
    snapshot: {
      ...snapshot,
      phase,
      markerEnterSettledAtMs,
      metadata: cloneRunOneHandoffMetadata({
        ...snapshot.metadata,
        ...(metadata ?? {}),
      }),
      updatedAtMs: getRunOneHandoffNowMs(),
    },
  };
};

export const resolveRunOneHandoffResetSnapshot = ({
  snapshot,
  operationId,
}: {
  snapshot: RunOneHandoffSnapshot;
  operationId?: string;
}): {
  accepted: boolean;
  snapshot: RunOneHandoffSnapshot;
} => {
  if (
    operationId &&
    snapshot.operationId &&
    operationId !== snapshot.operationId
  ) {
    return { accepted: false, snapshot };
  }

  return {
    accepted: true,
    snapshot: createRunOneHandoffIdleSnapshot(snapshot.sessionId),
  };
};
