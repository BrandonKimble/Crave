import React from 'react';

import type { SearchRootResultsPresentationControlPort } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootDataPlaneRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';

type UseSearchRootForegroundInputShortcutSyncRuntimeArgs = {
  resolvedSubmittedQuery: string;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootDataPlaneRuntime: Pick<
    SearchRootDataPlaneRuntime,
    'runtimeFlags'
  >;
  resultsPresentationOwner: SearchRootResultsPresentationControlPort;
};

export const useSearchRootForegroundInputShortcutSyncRuntime = ({
  resolvedSubmittedQuery,
  rootPrimitivesRuntime,
  rootDataPlaneRuntime,
  resultsPresentationOwner,
}: UseSearchRootForegroundInputShortcutSyncRuntimeArgs): void => {
  React.useEffect(() => {
    if (rootDataPlaneRuntime.runtimeFlags.searchMode !== 'shortcut') {
      return;
    }
    if (resultsPresentationOwner.shellModel.backdropTarget === 'default') {
      return;
    }
    if (
      rootPrimitivesRuntime.searchState.isSearchFocused ||
      rootPrimitivesRuntime.searchState.isSuggestionPanelActive
    ) {
      return;
    }
    const nextQuery = resolvedSubmittedQuery.trim();
    if (!nextQuery || nextQuery === rootPrimitivesRuntime.searchState.query) {
      return;
    }
    rootPrimitivesRuntime.searchState.setQuery(nextQuery);
  }, [
    resolvedSubmittedQuery,
    resultsPresentationOwner.shellModel.backdropTarget,
    rootPrimitivesRuntime.searchState.isSearchFocused,
    rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    rootPrimitivesRuntime.searchState.query,
    rootPrimitivesRuntime.searchState.setQuery,
    rootDataPlaneRuntime.runtimeFlags.searchMode,
  ]);
};
