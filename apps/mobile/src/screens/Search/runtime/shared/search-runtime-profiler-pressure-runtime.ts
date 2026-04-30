import React from 'react';

import type { RunOneHandoffCoordinatorLike } from './use-search-runtime-instrumentation-runtime-contract';

const RUN_ONE_COMMIT_SPAN_PRESSURE_THRESHOLD_MS = 45;
const RUN_ONE_COMMIT_SPAN_PRESSURE_COMPONENT_IDS = new Set([
  'SearchScreen',
  'SearchMapTree',
  'AppOverlayRouteHost',
  'SearchOverlayChrome',
  'BottomNav',
]);

export const applyRunOneCommitSpanPressure = ({
  id,
  commitSpanMs,
  resolvedRunNumber,
  getPerfNow,
  runOneCommitSpanPressureByOperationRef,
  runOneHandoffCoordinatorRef,
}: {
  id: string;
  commitSpanMs: number;
  resolvedRunNumber: number;
  getPerfNow: () => number;
  runOneCommitSpanPressureByOperationRef: React.MutableRefObject<Map<string, number>>;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinatorLike>;
}): void => {
  if (
    resolvedRunNumber !== 1 ||
    commitSpanMs < RUN_ONE_COMMIT_SPAN_PRESSURE_THRESHOLD_MS ||
    !RUN_ONE_COMMIT_SPAN_PRESSURE_COMPONENT_IDS.has(id)
  ) {
    return;
  }

  const handoffSnapshot = runOneHandoffCoordinatorRef.current.getSnapshot();
  const operationId = handoffSnapshot.operationId;
  if (!operationId || handoffSnapshot.phase === 'idle') {
    return;
  }

  const previousMaxCommitSpanMs =
    runOneCommitSpanPressureByOperationRef.current.get(operationId) ?? 0;
  const nextMaxCommitSpanMs = Math.max(previousMaxCommitSpanMs, commitSpanMs);
  if (nextMaxCommitSpanMs > previousMaxCommitSpanMs) {
    runOneCommitSpanPressureByOperationRef.current.set(
      operationId,
      nextMaxCommitSpanMs
    );
  }
  if (previousMaxCommitSpanMs <= 0) {
    runOneHandoffCoordinatorRef.current.advancePhase(handoffSnapshot.phase, {
      operationId,
      commitSpanPressure: true,
      maxRun1CommitSpanMs: Number(nextMaxCommitSpanMs.toFixed(1)),
      commitSpanPressureComponent: id,
      commitSpanPressureDetectedAtMs: Number(getPerfNow().toFixed(1)),
    });
  }
};
