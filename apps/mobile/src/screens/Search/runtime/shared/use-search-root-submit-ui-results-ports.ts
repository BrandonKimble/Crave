import React from 'react';

import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootRecentActivityAuthorityRuntime,
  SearchRootResultsScrollAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import { useSearchRootSubmitUiHistoryPorts } from './use-search-root-submit-ui-history-ports';
import { useSearchRootSubmitUiSurfacePorts } from './use-search-root-submit-ui-surface-ports';

type SearchRootSubmitUiResultsPorts = Pick<
  Parameters<typeof useSearchSubmitOwnerValue>[0]['uiPorts'],
  | 'resetSheetToHidden'
  | 'scrollResultsToTop'
  | 'resetMapMoveFlag'
  | 'loadRecentHistory'
  | 'updateLocalRecentSearches'
>;

type UseSearchRootSubmitUiResultsPortsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  recentActivityAuthorityRuntime: SearchRootRecentActivityAuthorityRuntime;
  resultsScrollAuthorityRuntime: SearchRootResultsScrollAuthorityRuntime;
};

export const useSearchRootSubmitUiResultsPorts = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  recentActivityAuthorityRuntime,
  resultsScrollAuthorityRuntime,
}: UseSearchRootSubmitUiResultsPortsArgs): SearchRootSubmitUiResultsPorts => {
  const historyUiPorts = useSearchRootSubmitUiHistoryPorts({
    stateFoundationLane,
    recentActivityAuthorityRuntime,
  });
  const surfaceUiPorts = useSearchRootSubmitUiSurfacePorts({
    rootOverlayFoundationRuntime,
    resultsScrollAuthorityRuntime,
  });

  return React.useMemo(
    () => ({
      ...historyUiPorts,
      ...surfaceUiPorts,
    }),
    [historyUiPorts, surfaceUiPorts]
  );
};
