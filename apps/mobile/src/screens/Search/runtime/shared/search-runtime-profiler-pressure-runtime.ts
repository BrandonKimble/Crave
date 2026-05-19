import React from 'react';

import type { SearchSurfaceRedrawCoordinatorLike } from './use-search-runtime-instrumentation-runtime-contract';

const RUN_ONE_COMMIT_SPAN_PRESSURE_THRESHOLD_MS = 45;
const RUN_ONE_COMMIT_SPAN_PRESSURE_COMPONENT_IDS = new Set([
  'SearchScreen',
  'SearchMapTree',
  'AppOverlayRouteHost',
  'SearchOverlayChrome',
  'BottomNav',
]);

export const applySearchSurfaceRedrawCommitSpanPressure = ({
  id,
  commitSpanMs,
  resolvedRunNumber,
  getPerfNow,
  searchSurfaceRedrawCommitSpanPressureByOperationRef,
  searchSurfaceRedrawCoordinatorRef,
}: {
  id: string;
  commitSpanMs: number;
  resolvedRunNumber: number;
  getPerfNow: () => number;
  searchSurfaceRedrawCommitSpanPressureByOperationRef: React.MutableRefObject<Map<string, number>>;
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinatorLike>;
}): void => {
  if (
    resolvedRunNumber !== 1 ||
    commitSpanMs < RUN_ONE_COMMIT_SPAN_PRESSURE_THRESHOLD_MS ||
    !RUN_ONE_COMMIT_SPAN_PRESSURE_COMPONENT_IDS.has(id)
  ) {
    return;
  }

  const handoffSnapshot = searchSurfaceRedrawCoordinatorRef.current.getSnapshot();
  const operationId = handoffSnapshot.operationId;
  if (!operationId || handoffSnapshot.phase === 'idle') {
    return;
  }

  const previousMaxCommitSpanMs =
    searchSurfaceRedrawCommitSpanPressureByOperationRef.current.get(operationId) ?? 0;
  const nextMaxCommitSpanMs = Math.max(previousMaxCommitSpanMs, commitSpanMs);
  if (nextMaxCommitSpanMs > previousMaxCommitSpanMs) {
    searchSurfaceRedrawCommitSpanPressureByOperationRef.current.set(
      operationId,
      nextMaxCommitSpanMs
    );
  }
  if (previousMaxCommitSpanMs <= 0) {
    searchSurfaceRedrawCoordinatorRef.current.advancePhase(handoffSnapshot.phase, {
      operationId,
      commitSpanPressure: true,
      maxSearchSurfaceRedrawCommitSpanMs: Number(nextMaxCommitSpanMs.toFixed(1)),
      commitSpanPressureComponent: id,
      commitSpanPressureDetectedAtMs: Number(getPerfNow().toFixed(1)),
    });
  }
};
