import type { SearchSurfaceRedrawSnapshot } from './search-surface-redraw-coordinator';

const nowMs = (): number =>
  typeof performance?.now === 'function' ? performance.now() : Date.now();

const cloneMetadata = (
  value: Record<string, unknown>
): Readonly<Record<string, unknown>> => ({
  ...value,
});

export const createSearchSurfaceRedrawSessionId = (): string =>
  `search-surface-redraw-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

export const createSearchSurfaceRedrawIdleSnapshot = (
  sessionId = createSearchSurfaceRedrawSessionId()
): SearchSurfaceRedrawSnapshot => ({
  sessionId,
  operationId: null,
  seq: null,
  page: null,
  phase: 'idle',
  markerEnterSettledAtMs: null,
  metadata: {},
  updatedAtMs: nowMs(),
});

export const createSearchSurfaceRedrawOperationSnapshot = ({
  snapshot,
  operationId,
  seq,
  page,
}: {
  snapshot: SearchSurfaceRedrawSnapshot;
  operationId: string;
  seq: number;
  page: number;
}): SearchSurfaceRedrawSnapshot => ({
  sessionId: snapshot.sessionId,
  operationId,
  seq,
  page,
  phase: 'idle',
  markerEnterSettledAtMs: null,
  metadata: {},
  updatedAtMs: nowMs(),
});

export const createSearchSurfaceRedrawPublicSnapshot = (
  snapshot: SearchSurfaceRedrawSnapshot
): SearchSurfaceRedrawSnapshot => ({
  ...snapshot,
  metadata: cloneMetadata(snapshot.metadata as Record<string, unknown>),
});

export const cloneSearchSurfaceRedrawMetadata = cloneMetadata;
export const getSearchSurfaceRedrawNowMs = nowMs;
