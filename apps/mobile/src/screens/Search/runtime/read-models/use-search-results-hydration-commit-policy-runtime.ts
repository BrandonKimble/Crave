import React from 'react';

type SearchResultsHydrationCommitPolicyRuntimeArgs = {
  activeOverlayKey: string;
  allowHydrationFinalizeCommit: boolean;
};

export const useSearchResultsHydrationCommitPolicyRuntime = ({
  activeOverlayKey,
  allowHydrationFinalizeCommit,
}: SearchResultsHydrationCommitPolicyRuntimeArgs) =>
  React.useMemo(
    () => ({
      shouldResetHydrationCommit:
        activeOverlayKey === 'search' && !allowHydrationFinalizeCommit,
    }),
    [activeOverlayKey, allowHydrationFinalizeCommit]
  );
