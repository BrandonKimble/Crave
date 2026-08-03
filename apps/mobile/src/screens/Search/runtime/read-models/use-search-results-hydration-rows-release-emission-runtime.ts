import React from 'react';

export const useSearchResultsHydrationRowsReleaseEmissionRuntime = ({
  activeOverlayKey,
  resultsIdentityKey,
  searchRequestId,
  emitRuntimeWriteSpan,
  releaseToken,
}: {
  activeOverlayKey: string;
  resultsIdentityKey: string | null;
  searchRequestId: string | null;
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

    // NOTE: this span carries NO duration. It used to report `getNowMs() - getNowMs()`,
    // which measures nothing and could only ever read ~0 — an always-green number is
    // worse than no number. The event is the fact worth emitting.
    emitRuntimeWriteSpan({
      label: 'hydration_finalize_rows_release',
      activeOverlayKey,
      searchRequestId,
      resultsIdentityKey,
    });
  }, [activeOverlayKey, emitRuntimeWriteSpan, releaseToken, resultsIdentityKey, searchRequestId]);
};
