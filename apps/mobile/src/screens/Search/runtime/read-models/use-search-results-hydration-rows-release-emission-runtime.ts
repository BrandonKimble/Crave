import React from 'react';

import type { MapQueryBudget } from '../map/map-query-budget';

const getNowMs = (): number =>
  typeof performance?.now === 'function' ? performance.now() : Date.now();

export const useSearchResultsHydrationRowsReleaseEmissionRuntime = ({
  activeOverlayKey,
  resultsIdentityKey,
  searchRequestId,
  mapQueryBudget,
  emitRuntimeWriteSpan,
  releaseToken,
}: {
  activeOverlayKey: string;
  resultsIdentityKey: string | null;
  searchRequestId: string | null;
  mapQueryBudget: MapQueryBudget;
  emitRuntimeWriteSpan: (payload: Record<string, unknown>) => void;
  releaseToken: string | null;
}) => {
  const previousReleaseTokenRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (releaseToken == null) {
      return;
    }
    if (previousReleaseTokenRef.current === releaseToken) {
      return;
    }
    previousReleaseTokenRef.current = releaseToken;

    const durationMs = getNowMs() - getNowMs();
    mapQueryBudget.recordRuntimeAttributionDurationMs(
      'hydration_finalize_rows_release',
      durationMs
    );
    emitRuntimeWriteSpan({
      label: 'hydration_finalize_rows_release',
      activeOverlayKey,
      searchRequestId,
      resultsIdentityKey,
      durationMs,
    });
  }, [
    activeOverlayKey,
    emitRuntimeWriteSpan,
    mapQueryBudget,
    releaseToken,
    resultsIdentityKey,
    searchRequestId,
  ]);
};
