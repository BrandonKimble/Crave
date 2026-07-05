import React from 'react';

export const useSearchResultsHydrationKeyCommitEmissionRuntime = ({
  emitRuntimeWriteSpan,
  resolveOperationId,
  activeOverlayKey,
  searchRequestId,
}: {
  emitRuntimeWriteSpan: (payload: Record<string, unknown>) => void;
  resolveOperationId: () => string;
  activeOverlayKey: string;
  searchRequestId: string | null;
}) =>
  React.useCallback(
    (nextHydrationKey: string | null, durationMs: number) => {
      emitRuntimeWriteSpan({
        label: 'hydration_finalize_key_commit',
        operationId: resolveOperationId(),
        activeOverlayKey,
        searchRequestId,
        resultsIdentityKey: nextHydrationKey,
        durationMs,
      });
    },
    [activeOverlayKey, emitRuntimeWriteSpan, resolveOperationId, searchRequestId]
  );
