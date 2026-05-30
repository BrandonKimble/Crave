import React from 'react';

import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootResultsScrollAuthorityRuntime } from './search-root-control-ports-runtime-contract';

type SearchRootSubmitUiSurfacePorts = Pick<
  Parameters<typeof useSearchSubmitOwnerValue>[0]['uiPorts'],
  'resetSheetToHidden' | 'scrollResultsToTop' | 'resetMapMoveFlag'
>;

type UseSearchRootSubmitUiSurfacePortsArgs = {
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  resultsScrollAuthorityRuntime: SearchRootResultsScrollAuthorityRuntime;
};

export const useSearchRootSubmitUiSurfacePorts = ({
  rootOverlayFoundationRuntime,
  resultsScrollAuthorityRuntime,
}: UseSearchRootSubmitUiSurfacePortsArgs): SearchRootSubmitUiSurfacePorts => {
  const { rootSharedSheetRuntimeLane, appRouteSharedSheetRuntimeOwner } =
    rootOverlayFoundationRuntime;
  const { resultsScrollPort } = resultsScrollAuthorityRuntime;

  return React.useMemo(
    () => ({
      resetSheetToHidden: appRouteSharedSheetRuntimeOwner.markSharedSheetHidden,
      scrollResultsToTop: resultsScrollPort.scrollResultsToTop,
      resetMapMoveFlag: rootSharedSheetRuntimeLane.resetMapMoveFlag,
    }),
    [
      resultsScrollPort.scrollResultsToTop,
      rootSharedSheetRuntimeLane.resetMapMoveFlag,
      appRouteSharedSheetRuntimeOwner.markSharedSheetHidden,
    ]
  );
};
