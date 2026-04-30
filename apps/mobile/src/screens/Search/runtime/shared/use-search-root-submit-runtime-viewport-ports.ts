import React from 'react';

import type { SearchRootEnvironment } from './search-root-environment-contract';

type SearchRootSubmitRuntimePorts = Parameters<
  typeof import('../../hooks/use-search-submit-owner').default
>[0]['runtimePorts'];

type SearchRootSubmitRuntimeViewportPorts = Pick<
  SearchRootSubmitRuntimePorts,
  'runSearch' | 'mapRef' | 'latestBoundsRef' | 'viewportBoundsService' | 'userLocationRef'
>;

type UseSearchRootSubmitRuntimeViewportPortsArgs = {
  runSearch: SearchRootSubmitRuntimePorts['runSearch'];
  mapRef: SearchRootSubmitRuntimePorts['mapRef'];
  latestBoundsRef: SearchRootSubmitRuntimePorts['latestBoundsRef'];
  viewportBoundsService: SearchRootSubmitRuntimePorts['viewportBoundsService'];
  userLocation: SearchRootEnvironment['userLocation'];
};

export const useSearchRootSubmitRuntimeViewportPorts = ({
  runSearch,
  mapRef,
  latestBoundsRef,
  viewportBoundsService,
  userLocation,
}: UseSearchRootSubmitRuntimeViewportPortsArgs): SearchRootSubmitRuntimeViewportPorts => {
  const stableUserLocationRef = React.useRef(userLocation ?? null);

  React.useEffect(() => {
    stableUserLocationRef.current = userLocation ?? null;
  }, [userLocation]);

  return React.useMemo(
    () => ({
      runSearch,
      mapRef,
      latestBoundsRef,
      viewportBoundsService,
      userLocationRef: stableUserLocationRef,
    }),
    [latestBoundsRef, mapRef, runSearch, viewportBoundsService]
  );
};
