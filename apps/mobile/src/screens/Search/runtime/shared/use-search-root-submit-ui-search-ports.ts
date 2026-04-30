import React from 'react';

import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

type SearchRootSubmitUiSearchPorts = Pick<
  Parameters<typeof useSearchSubmitOwnerValue>[0]['uiPorts'],
  'setActiveTab' | 'setError' | 'isSearchEditingRef'
>;

type UseSearchRootSubmitUiSearchPortsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
};

export const useSearchRootSubmitUiSearchPorts = ({
  stateFoundationLane,
}: UseSearchRootSubmitUiSearchPortsArgs): SearchRootSubmitUiSearchPorts => {
  const { rootPrimitivesRuntime } = stateFoundationLane;

  return React.useMemo(
    () => ({
      setActiveTab:
        rootPrimitivesRuntime.searchState
          .setActiveTab as React.Dispatch<React.SetStateAction<'restaurants' | 'dishes'>>,
      setError: rootPrimitivesRuntime.searchState.setError,
      isSearchEditingRef: rootPrimitivesRuntime.searchState.isSearchEditingRef,
    }),
    [
      rootPrimitivesRuntime.searchState.isSearchEditingRef,
      rootPrimitivesRuntime.searchState.setActiveTab,
      rootPrimitivesRuntime.searchState.setError,
    ]
  );
};
