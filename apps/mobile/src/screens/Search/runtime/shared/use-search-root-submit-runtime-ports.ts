import React from 'react';

import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootRequestExecutionAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import { useSearchRootSubmitRuntimeCorePorts } from './use-search-root-submit-runtime-core-ports';
import { useSearchRootSubmitRuntimeViewportPorts } from './use-search-root-submit-runtime-viewport-ports';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';

type SearchRootSubmitRuntimePorts = Parameters<
  typeof import('../../hooks/use-search-submit-owner').default
>[0]['runtimePorts'];

type UseSearchRootSubmitRuntimePortsArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  requestExecutionAuthorityRuntime: SearchRootRequestExecutionAuthorityRuntime;
  userLocation: SearchRootEnvironment['userLocation'];
};

export const useSearchRootSubmitRuntimePorts = ({
  sessionCoreLane,
  stateFoundationLane,
  requestExecutionAuthorityRuntime,
  userLocation,
}: UseSearchRootSubmitRuntimePortsArgs): SearchRootSubmitRuntimePorts => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime, sessionPrimitivesLane } =
    stateFoundationLane;
  const { lastAutoOpenKeyRef, searchRequestRuntimeOwner } = requestExecutionAuthorityRuntime;
  const coreRuntimePorts = useSearchRootSubmitRuntimeCorePorts({
    runtimeWorkSchedulerRef: sessionCoreLane.runtimeWorkSchedulerRef,
    searchRuntimeBus: sessionCoreLane.searchRuntimeBus,
    lastSearchRequestIdRef: sessionPrimitivesLane.primitives.lastSearchRequestIdRef,
    lastAutoOpenKeyRef,
    requestRuntimeOwner: searchRequestRuntimeOwner,
  });
  const viewportRuntimePorts = useSearchRootSubmitRuntimeViewportPorts({
    runSearch: rootDataPlaneRuntime.requestStatusRuntime.runSearch,
    mapRef: rootPrimitivesRuntime.mapState.mapRef,
    latestBoundsRef: sessionCoreLane.latestBoundsRef,
    viewportBoundsService: sessionCoreLane.viewportBoundsService,
    userLocation,
  });

  return React.useMemo(
    () => ({
      ...coreRuntimePorts,
      resultsPresentationAuthority: sessionCoreLane.resultsPresentationAuthority,
      resultsPresentationSurfaceAuthority:
        sessionCoreLane.resultsPresentationSurfaceAuthority,
      ...viewportRuntimePorts,
    }),
    [
      coreRuntimePorts,
      sessionCoreLane.resultsPresentationAuthority,
      sessionCoreLane.resultsPresentationSurfaceAuthority,
      viewportRuntimePorts,
    ]
  );
};
