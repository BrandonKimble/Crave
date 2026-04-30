import React from 'react';

import type { SearchRootResultsInteractionAuthorityRuntime } from './search-root-control-ports-runtime-contract';

export const useSearchRootResultsInteractionAuthorityRuntime =
  (): SearchRootResultsInteractionAuthorityRuntime => {
    const resetResultsListScrollProgressRef = React.useRef<() => void>(() => {});

    return React.useMemo(
      () => ({
        resultsInteractionPorts: {
          resetResultsListScrollProgressRef,
        },
      }),
      []
    );
  };
