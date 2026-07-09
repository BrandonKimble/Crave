import React from 'react';

import type { useSearchResultsHydrationSettleStateRuntime } from './use-search-results-hydration-settle-state-runtime';

type SearchResultsHydrationRowsReleaseRuntimeArgs = {
  resultsIdentityKey: string | null;
  activeOverlayKey: string;
  settleStateRuntime: ReturnType<typeof useSearchResultsHydrationSettleStateRuntime>;
};

export const useSearchResultsHydrationRowsReleaseRuntime = ({
  resultsIdentityKey,
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
  }, [resultsIdentityKey, setHydrationFinalizeRowsReleaseCompletedToken]);

  React.useEffect(() => {
    if (!resultsIdentityKey) {
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
    resultsIdentityKey,
    setHydrationFinalizeRowsReleaseCompletedToken,
  ]);

  React.useEffect(() => {
    if (!resultsIdentityKey || isHydrationPending) {
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
    resultsIdentityKey,
    setHydrationFinalizeRowsReleaseCompletedToken,
  ]);
};
