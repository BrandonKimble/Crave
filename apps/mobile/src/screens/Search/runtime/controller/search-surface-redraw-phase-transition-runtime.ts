import {
  SEARCH_SURFACE_REDRAW_PHASE_ORDER,
  type SearchSurfaceRedrawPhase,
} from './search-surface-redraw-phase';
import type {
  SearchSurfaceRedrawAdvanceMetadata,
  SearchSurfaceRedrawSnapshot,
} from './search-surface-redraw-coordinator';
import {
  cloneSearchSurfaceRedrawMetadata,
  createSearchSurfaceRedrawIdleSnapshot,
  getSearchSurfaceRedrawNowMs,
} from './search-surface-redraw-snapshot-runtime';

const phaseIndexByName = SEARCH_SURFACE_REDRAW_PHASE_ORDER.reduce(
  (map, phase, index) => map.set(phase, index),
  new Map<SearchSurfaceRedrawPhase, number>()
);

export const resolveSearchSurfaceRedrawAdvanceSnapshot = ({
  snapshot,
  phase,
  metadata,
}: {
  snapshot: SearchSurfaceRedrawSnapshot;
  phase: SearchSurfaceRedrawPhase;
  metadata?: SearchSurfaceRedrawAdvanceMetadata;
}): {
  accepted: boolean;
  snapshot: SearchSurfaceRedrawSnapshot;
} => {
  const activeOperationId = snapshot.operationId;
  const metadataOperationId = metadata?.operationId ?? null;

  if (metadataOperationId && activeOperationId && metadataOperationId !== activeOperationId) {
    return { accepted: false, snapshot };
  }

  if (!activeOperationId && phase !== 'idle') {
    return { accepted: false, snapshot };
  }

  const previousPhase = snapshot.phase;
  const previousIndex = phaseIndexByName.get(previousPhase) ?? 0;
  const nextIndex = phaseIndexByName.get(phase) ?? 0;

  if (phase !== previousPhase && (nextIndex < previousIndex || nextIndex > previousIndex + 1)) {
    return { accepted: false, snapshot };
  }

  if (phase === 'idle') {
    return {
      accepted: true,
      snapshot: createSearchSurfaceRedrawIdleSnapshot(snapshot.sessionId),
    };
  }

  const markerEnterSettledAtMs = metadata?.markerEnterSettled
    ? (metadata?.markerEnterSettledAtMs ?? getSearchSurfaceRedrawNowMs())
    : snapshot.markerEnterSettledAtMs;

  return {
    accepted: true,
    snapshot: {
      ...snapshot,
      phase,
      markerEnterSettledAtMs,
      metadata: cloneSearchSurfaceRedrawMetadata({
        ...snapshot.metadata,
        ...(metadata ?? {}),
      }),
      updatedAtMs: getSearchSurfaceRedrawNowMs(),
    },
  };
};

export const resolveSearchSurfaceRedrawResetSnapshot = ({
  snapshot,
  operationId,
}: {
  snapshot: SearchSurfaceRedrawSnapshot;
  operationId?: string;
}): {
  accepted: boolean;
  snapshot: SearchSurfaceRedrawSnapshot;
} => {
  if (operationId && snapshot.operationId && operationId !== snapshot.operationId) {
    return { accepted: false, snapshot };
  }

  return {
    accepted: true,
    snapshot: createSearchSurfaceRedrawIdleSnapshot(snapshot.sessionId),
  };
};
