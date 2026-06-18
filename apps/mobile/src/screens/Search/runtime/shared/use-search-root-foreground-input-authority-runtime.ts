import React from 'react';

import type {
  SearchRootAutocompleteAuthorityRuntime,
  SearchRootForegroundInputAuthorityRuntime,
  SearchRootResultsPresentationAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchOverlayStoreRuntime } from './search-root-scaffold-runtime-contract';
import type { SearchRootDataPlaneRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import { useSearchRootForegroundInputRuntime } from './use-search-root-foreground-input-runtime';

type UseSearchRootForegroundInputAuthorityRuntimeArgs = {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootDataPlaneRuntime: Pick<
    SearchRootDataPlaneRuntime,
    'requestStatusRuntime' | 'resultsArrivalState' | 'runtimeFlags'
  >;
  rootOverlayStoreRuntime: Pick<SearchOverlayStoreRuntime, 'dismissTransientOverlays'>;
  resultsPresentationAuthorityRuntime: SearchRootResultsPresentationAuthorityRuntime;
  autocompleteAuthorityRuntime: SearchRootAutocompleteAuthorityRuntime;
};

export const useSearchRootForegroundInputAuthorityRuntime = ({
  rootPrimitivesRuntime,
  rootDataPlaneRuntime,
  rootOverlayStoreRuntime,
  resultsPresentationAuthorityRuntime,
  autocompleteAuthorityRuntime,
}: UseSearchRootForegroundInputAuthorityRuntimeArgs): SearchRootForegroundInputAuthorityRuntime => {
  const foregroundInputRuntime = useSearchRootForegroundInputRuntime({
    rootPrimitivesRuntime,
    rootDataPlaneRuntime,
    rootOverlayStoreRuntime,
    resultsPresentationOwner: resultsPresentationAuthorityRuntime.resultsPresentationOwner,
    autocompleteRuntime: autocompleteAuthorityRuntime.autocompleteRuntime,
  });

  return React.useMemo(
    () => ({
      foregroundInputRuntime,
    }),
    [foregroundInputRuntime]
  );
};
