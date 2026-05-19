import React from 'react';

import type { useSearchResultsHydrationSettleStateRuntime } from './use-search-results-hydration-settle-state-runtime';

type SearchResultsHydrationRowsReleaseRuntimeArgs = {
  resultsHydrationKey: string | null;
  activeOverlayKey: string;
  settleStateRuntime: ReturnType<typeof useSearchResultsHydrationSettleStateRuntime>;
};

export const useSearchResultsHydrationRowsReleaseRuntime = ({
  resultsHydrationKey,
  activeOverlayKey,
  settleStateRuntime,
}: SearchResultsHydrationRowsReleaseRuntimeArgs) => {
  const {
    hydrationRowsReleaseVersionToken,
    isHydrationPending,
    setHydrationFinalizeRowsReleaseCompletedToken,
  } = settleStateRuntime;

  React.useEffect(() => {
    setHydrationFinalizeRowsReleaseCompletedToken(null);
  }, [resultsHydrationKey, setHydrationFinalizeRowsReleaseCompletedToken]);

  React.useEffect(() => {
    if (!resultsHydrationKey) {
      setHydrationFinalizeRowsReleaseCompletedToken(null);
      return;
    }

    if (!isHydrationPending) {
      return;
    }

    if (activeOverlayKey !== 'search') {
      setHydrationFinalizeRowsReleaseCompletedToken(hydrationRowsReleaseVersionToken);
    }
  }, [
    activeOverlayKey,
    hydrationRowsReleaseVersionToken,
    isHydrationPending,
    resultsHydrationKey,
    setHydrationFinalizeRowsReleaseCompletedToken,
  ]);

  React.useEffect(() => {
    if (!resultsHydrationKey || isHydrationPending) {
      return;
    }
    if (activeOverlayKey === 'search') {
      return;
    }
    setHydrationFinalizeRowsReleaseCompletedToken(hydrationRowsReleaseVersionToken);
  }, [
    activeOverlayKey,
    hydrationRowsReleaseVersionToken,
    isHydrationPending,
    resultsHydrationKey,
    setHydrationFinalizeRowsReleaseCompletedToken,
  ]);
};
