import React from 'react';

import type { SearchRootMutationCancelAuthorityRuntime } from './search-root-control-ports-runtime-contract';

export const useSearchRootMutationCancelAuthorityRuntime =
  (): SearchRootMutationCancelAuthorityRuntime => {
    const cancelPendingMutationWorkRef = React.useRef<() => void>(() => {});

    const mutationCancelPort = React.useMemo(
      () => ({
        registerPendingMutationWorkCancel: (handler: () => void) => {
          cancelPendingMutationWorkRef.current = handler;
        },
        cancelPendingMutationWork: () => {
          cancelPendingMutationWorkRef.current();
        },
      }),
      []
    );

    return React.useMemo(
      () => ({
        mutationCancelPort,
      }),
      [mutationCancelPort]
    );
  };
