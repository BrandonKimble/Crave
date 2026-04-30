import React from 'react';

import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootRouteHostPublication } from './search-root-route-publication-contract';
import type { SearchRootRouteVisualHostPublicationLane } from './search-root-route-runtime-contract';
import { useSearchRootRouteHostOverlayGeometryRuntime } from './use-search-root-route-host-overlay-geometry-runtime';
import type { AppRouteHostVisualRuntime } from '../../../../navigation/runtime/app-route-host-visual-runtime-contract';

export const useSearchRootRouteVisualHostPublicationRuntime = ({
  routeVisualHostPublicationLane,
  rootOverlayFoundationRuntime,
  routeHostVisualRuntime,
}: {
  routeVisualHostPublicationLane: SearchRootRouteVisualHostPublicationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  routeHostVisualRuntime: AppRouteHostVisualRuntime;
}): void => {
  const routeHostOverlayGeometryRuntime =
    useSearchRootRouteHostOverlayGeometryRuntime({
      rootOverlayFoundationRuntime,
    });
  const routeHostPublication = React.useMemo<SearchRootRouteHostPublication>(
    () => ({
      routeHostOverlayGeometryRuntime,
      routeHostVisualRuntime,
    }),
    [
      routeHostOverlayGeometryRuntime,
      routeHostVisualRuntime,
    ]
  );

  React.useEffect(() => {
    routeVisualHostPublicationLane.syncRouteHostPublication(routeHostPublication);
  }, [routeHostPublication, routeVisualHostPublicationLane]);
};
