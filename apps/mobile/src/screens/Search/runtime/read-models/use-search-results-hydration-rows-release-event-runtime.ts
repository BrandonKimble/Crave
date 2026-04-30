import React from 'react';

import type { useSearchResultsHydrationSettleStateRuntime } from './use-search-results-hydration-settle-state-runtime';

export const useSearchResultsHydrationRowsReleaseEventRuntime = ({
  settleStateRuntime,
}: {
  settleStateRuntime: ReturnType<typeof useSearchResultsHydrationSettleStateRuntime>;
}) =>
  React.useMemo(() => {
    const releaseToken =
      settleStateRuntime.hydrationFinalizeRowsReleaseCompletedToken;
    if (
      releaseToken == null ||
      releaseToken !== settleStateRuntime.hydrationRowsReleaseVersionToken
    ) {
      return null;
    }
    return releaseToken;
  }, [
    settleStateRuntime.hydrationFinalizeRowsReleaseCompletedToken,
    settleStateRuntime.hydrationRowsReleaseVersionToken,
  ]);
