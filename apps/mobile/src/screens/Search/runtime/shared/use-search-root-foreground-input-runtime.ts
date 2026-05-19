import React from 'react';

import { createSearchRootForegroundInputRuntimeValue } from '../controller/search-root-foreground-input-runtime';
import type { SearchRootDataPlaneRuntime } from './use-search-root-session-runtime-contract';
import type { SearchOverlayStoreRuntime } from './search-root-scaffold-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchRootForegroundInputRuntime } from './search-root-control-ports-runtime-contract';
import type { SearchRootResultsPresentationControlPort } from './use-search-root-control-plane-runtime-contract';
import { useSearchRootForegroundInputFocusRuntime } from './use-search-root-foreground-input-focus-runtime';
import { useSearchRootForegroundInputSessionRuntime } from './use-search-root-foreground-input-session-runtime';
import { useSearchRootForegroundInputShortcutSyncRuntime } from './use-search-root-foreground-input-shortcut-sync-runtime';
import { useSearchAutocompleteRuntime } from './use-search-autocomplete-runtime';

type UseSearchRootForegroundInputRuntimeArgs = {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootDataPlaneRuntime: Pick<
    SearchRootDataPlaneRuntime,
    'requestStatusRuntime' | 'resultsArrivalState' | 'runtimeFlags'
  >;
  rootOverlayStoreRuntime: Pick<SearchOverlayStoreRuntime, 'dismissTransientOverlays'>;
  resultsPresentationOwner: SearchRootResultsPresentationControlPort;
  autocompleteRuntime: ReturnType<typeof useSearchAutocompleteRuntime>;
};

export const useSearchRootForegroundInputRuntime = ({
  rootPrimitivesRuntime,
  rootDataPlaneRuntime,
  rootOverlayStoreRuntime,
  resultsPresentationOwner,
  autocompleteRuntime,
}: UseSearchRootForegroundInputRuntimeArgs): SearchRootForegroundInputRuntime => {
  const foregroundInputSessionRuntime = useSearchRootForegroundInputSessionRuntime({
    rootPrimitivesRuntime,
    rootDataPlaneRuntime,
  });
  useSearchRootForegroundInputShortcutSyncRuntime({
    resolvedSubmittedQuery: foregroundInputSessionRuntime.resolvedSubmittedQuery,
    rootPrimitivesRuntime,
    rootDataPlaneRuntime,
    resultsPresentationOwner,
  });
  const foregroundInputFocusRuntime = useSearchRootForegroundInputFocusRuntime({
    resolvedSubmittedQuery: foregroundInputSessionRuntime.resolvedSubmittedQuery,
    captureSearchSessionQuery: foregroundInputSessionRuntime.captureSearchSessionQuery,
    rootPrimitivesRuntime,
    rootDataPlaneRuntime,
    rootOverlayStoreRuntime,
    resultsPresentationOwner,
    autocompleteRuntime,
  });

  return React.useMemo(
    () =>
      createSearchRootForegroundInputRuntimeValue({
        captureSearchSessionQuery: foregroundInputSessionRuntime.captureSearchSessionQuery,
        focusSearchInput: foregroundInputFocusRuntime.focusSearchInput,
        handleQueryChange: foregroundInputSessionRuntime.handleQueryChange,
      }),
    [
      foregroundInputFocusRuntime.focusSearchInput,
      foregroundInputSessionRuntime.captureSearchSessionQuery,
      foregroundInputSessionRuntime.handleQueryChange,
    ]
  );
};
