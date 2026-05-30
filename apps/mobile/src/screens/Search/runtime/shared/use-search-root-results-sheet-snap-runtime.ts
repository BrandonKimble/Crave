import React from 'react';

import type { useSearchRootResultsSheetInteractionStateRuntime } from './use-search-root-results-sheet-interaction-state-runtime';

type UseSearchRootResultsSheetSnapRuntimeArgs = {
  interactionStateRuntime: ReturnType<typeof useSearchRootResultsSheetInteractionStateRuntime>;
};

export const useSearchRootResultsSheetSnapRuntime = ({
  interactionStateRuntime,
}: UseSearchRootResultsSheetSnapRuntimeArgs) => {
  const handleResultsSheetSettlingChange = React.useCallback(
    (isSettling: boolean) => {
      interactionStateRuntime.setResultsSheetSettlingState(isSettling);
      if (isSettling) {
        return;
      }
      interactionStateRuntime.handleResultsSheetDragStateChange(false);
    },
    [interactionStateRuntime]
  );

  return React.useMemo(
    () => ({
      handleResultsSheetSettlingChange,
    }),
    [handleResultsSheetSettlingChange]
  );
};
