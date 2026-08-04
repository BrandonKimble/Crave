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

/** F1614: the old `Map.get(phase) ?? 0` fallback could never fire, and the day it could
 *  (a phase outside the ORDER) it would silently map the unknown phase onto `'idle'`'s slot and
 *  corrupt the very ordering rule it serves. With the union DERIVED from the ORDER (F1613) the
 *  lookup is TOTAL by construction: every `SearchSurfaceRedrawPhase` is an element of the array,
 *  so `indexOf` cannot return -1 and there is no fallback to get wrong. */
const resolvePhaseIndex = (phase: SearchSurfaceRedrawPhase): number =>
  SEARCH_SURFACE_REDRAW_PHASE_ORDER.indexOf(phase);

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
  const previousIndex = resolvePhaseIndex(previousPhase);
  const nextIndex = resolvePhaseIndex(phase);

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
