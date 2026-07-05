import React from 'react';

type SearchResultsHydrationCommitPolicyRuntimeArgs = {
  activeOverlayKey: string;
  getAllowHydrationFinalizeCommit?: () => boolean;
  resultsIdentityKey: string | null;
};

export const useSearchResultsHydrationCommitPolicyRuntime = ({
  activeOverlayKey,
  getAllowHydrationFinalizeCommit,
  resultsIdentityKey,
}: SearchResultsHydrationCommitPolicyRuntimeArgs) =>
  React.useMemo(
    () => ({
      shouldResetHydrationCommit:
        activeOverlayKey === 'search' &&
        getAllowHydrationFinalizeCommit?.() === false &&
        resultsIdentityKey == null,
    }),
    [activeOverlayKey, getAllowHydrationFinalizeCommit, resultsIdentityKey]
  );
