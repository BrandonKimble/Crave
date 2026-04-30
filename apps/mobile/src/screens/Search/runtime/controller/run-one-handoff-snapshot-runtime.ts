import type { RunOneHandoffSnapshot } from './run-one-handoff-coordinator';

const nowMs = (): number =>
  typeof performance?.now === 'function' ? performance.now() : Date.now();

const cloneMetadata = (
  value: Record<string, unknown>
): Readonly<Record<string, unknown>> => ({
  ...value,
});

export const createRunOneHandoffSessionId = (): string =>
  `run1-handoff-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

export const createRunOneHandoffIdleSnapshot = (
  sessionId = createRunOneHandoffSessionId()
): RunOneHandoffSnapshot => ({
  sessionId,
  operationId: null,
  seq: null,
  page: null,
  phase: 'idle',
  markerEnterSettledAtMs: null,
  metadata: {},
  updatedAtMs: nowMs(),
});

export const createRunOneHandoffOperationSnapshot = ({
  snapshot,
  operationId,
  seq,
  page,
}: {
  snapshot: RunOneHandoffSnapshot;
  operationId: string;
  seq: number;
  page: number;
}): RunOneHandoffSnapshot => ({
  sessionId: snapshot.sessionId,
  operationId,
  seq,
  page,
  phase: 'idle',
  markerEnterSettledAtMs: null,
  metadata: {},
  updatedAtMs: nowMs(),
});

export const createRunOneHandoffPublicSnapshot = (
  snapshot: RunOneHandoffSnapshot
): RunOneHandoffSnapshot => ({
  ...snapshot,
  metadata: cloneMetadata(snapshot.metadata as Record<string, unknown>),
});

export const cloneRunOneHandoffMetadata = cloneMetadata;
export const getRunOneHandoffNowMs = nowMs;
