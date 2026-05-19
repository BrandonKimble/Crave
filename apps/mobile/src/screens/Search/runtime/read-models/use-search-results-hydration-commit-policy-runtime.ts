import React from 'react';

type SearchResultsHydrationCommitPolicyRuntimeArgs = {
  activeOverlayKey: string;
  getAllowHydrationFinalizeCommit?: () => boolean;
  resultsHydrationKey: string | null;
};

export const useSearchResultsHydrationCommitPolicyRuntime = ({
  activeOverlayKey,
  getAllowHydrationFinalizeCommit,
  resultsHydrationKey,
}: SearchResultsHydrationCommitPolicyRuntimeArgs) =>
  React.useMemo(
    () => ({
      shouldResetHydrationCommit:
        activeOverlayKey === 'search' &&
        getAllowHydrationFinalizeCommit?.() === false &&
        resultsHydrationKey == null,
    }),
    [activeOverlayKey, getAllowHydrationFinalizeCommit, resultsHydrationKey]
  );
