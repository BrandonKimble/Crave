import React from 'react';

import type {
  SearchRootForegroundInputRuntime,
  SearchRootClearRestoreAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchForegroundEditingRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type SearchRootForegroundEditingClearArgs = Pick<
  SearchForegroundEditingRuntimeArgs,
  'clearOwner' | 'captureSearchSessionQuery'
>;

type UseSearchRootForegroundEditingClearArgsArgs = {
  clearRestoreAuthorityRuntime: SearchRootClearRestoreAuthorityRuntime;
  foregroundInputRuntime: SearchRootForegroundInputRuntime;
};

export const useSearchRootForegroundEditingClearArgs = ({
  clearRestoreAuthorityRuntime,
  foregroundInputRuntime,
}: UseSearchRootForegroundEditingClearArgsArgs): SearchRootForegroundEditingClearArgs => {
  const { clearOwner } = clearRestoreAuthorityRuntime;

  return React.useMemo(
    () => ({
      clearOwner: {
        clearTypedQuery: clearOwner.clearTypedQuery,
        clearSearchState: clearOwner.clearSearchState,
      },
      captureSearchSessionQuery: foregroundInputRuntime.captureSearchSessionQuery,
    }),
    [
      clearOwner.clearSearchState,
      clearOwner.clearTypedQuery,
      foregroundInputRuntime.captureSearchSessionQuery,
    ]
  );
};
