import React from 'react';

import type { SearchRootEnvironment } from './search-root-environment-contract';

type SearchRootSubmitRuntimePorts = Parameters<
  typeof import('../../hooks/use-search-submit-owner').default
>[0]['runtimePorts'];

type SearchRootSubmitRuntimeViewportPorts = Pick<
  SearchRootSubmitRuntimePorts,
  'runSearch' | 'mapRef' | 'viewportBoundsService' | 'userLocationRef'
>;

type UseSearchRootSubmitRuntimeViewportPortsArgs = {
  runSearch: SearchRootSubmitRuntimePorts['runSearch'];
  mapRef: SearchRootSubmitRuntimePorts['mapRef'];
  viewportBoundsService: SearchRootSubmitRuntimePorts['viewportBoundsService'];
  userLocation: SearchRootEnvironment['userLocation'];
};

export const useSearchRootSubmitRuntimeViewportPorts = ({
  runSearch,
  mapRef,
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
      viewportBoundsService,
      userLocationRef: stableUserLocationRef,
    }),
    [mapRef, runSearch, viewportBoundsService]
  );
};
