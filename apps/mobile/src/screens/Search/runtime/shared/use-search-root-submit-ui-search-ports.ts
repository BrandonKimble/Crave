import React from 'react';

import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

type SearchRootSubmitUiSearchPorts = Pick<
  Parameters<typeof useSearchSubmitOwnerValue>[0]['uiPorts'],
  'setError' | 'isSearchEditingRef'
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
      setError: rootPrimitivesRuntime.searchState.setError,
      isSearchEditingRef: rootPrimitivesRuntime.searchState.isSearchEditingRef,
    }),
    [
      rootPrimitivesRuntime.searchState.isSearchEditingRef,
      rootPrimitivesRuntime.searchState.setError,
    ]
  );
};
