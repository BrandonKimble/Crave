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
  React.useEffect(() => {
    settleStateRuntime.setHydrationFinalizeRowsReleaseCompletedToken(null);
  }, [
    resultsHydrationKey,
    settleStateRuntime,
  ]);

  React.useEffect(() => {
    if (!resultsHydrationKey) {
      settleStateRuntime.setHydrationFinalizeRowsReleaseCompletedToken(null);
      return;
    }

    if (!settleStateRuntime.isHydrationPending) {
      return;
    }

    if (activeOverlayKey !== 'search') {
      settleStateRuntime.setHydrationFinalizeRowsReleaseCompletedToken(
        settleStateRuntime.hydrationRowsReleaseVersionToken
      );
    }
  }, [
    activeOverlayKey,
    resultsHydrationKey,
    settleStateRuntime,
  ]);

  React.useEffect(() => {
    if (!resultsHydrationKey || settleStateRuntime.isHydrationPending) {
      return;
    }
    settleStateRuntime.setHydrationFinalizeRowsReleaseCompletedToken(
      settleStateRuntime.hydrationRowsReleaseVersionToken
    );
  }, [resultsHydrationKey, settleStateRuntime]);
};
