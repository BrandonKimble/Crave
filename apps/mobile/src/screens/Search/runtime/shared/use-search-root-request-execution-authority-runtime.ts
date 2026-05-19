import React from 'react';

import { useSearchRequestRuntimeOwner } from '../../hooks/use-search-request-runtime-owner';
import type { SearchRootMapViewportIntentRuntime } from './search-root-map-viewport-intent-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootRequestExecutionAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';
import { useSearchSessionShadowTransitionRuntime } from './use-search-session-shadow-transition-runtime';

type UseSearchRootRequestExecutionAuthorityRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  mapViewportIntentRuntime: SearchRootMapViewportIntentRuntime;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
};

export const useSearchRootRequestExecutionAuthorityRuntime = ({
  sessionCoreLane,
  mapViewportIntentRuntime: _mapViewportIntentRuntime,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
}: UseSearchRootRequestExecutionAuthorityRuntimeArgs): SearchRootRequestExecutionAuthorityRuntime => {
  const { rootDataPlaneRuntime } = stateFoundationLane;
  const { rootInstrumentationRuntime } = rootOverlayFoundationRuntime;
  const lastAutoOpenKeyRef = React.useRef<string | null>(null);

  const handleSearchSessionShadowTransition = useSearchSessionShadowTransitionRuntime({
    searchSurfaceRedrawCoordinatorRef: sessionCoreLane
      .searchSurfaceRedrawCoordinatorRef as Parameters<
      typeof useSearchSessionShadowTransitionRuntime
    >[0]['searchSurfaceRedrawCoordinatorRef'],
  });

  const searchRequestRuntimeOwner = useSearchRequestRuntimeOwner({
    cancelSearch: rootDataPlaneRuntime.requestStatusRuntime.cancelSearch,
    onSearchRequestLoadingChange: rootDataPlaneRuntime.runtimeFlags.setSearchRequestLoading,
    searchRuntimeBus: sessionCoreLane.searchRuntimeBus,
    runtimeSessionController: sessionCoreLane.searchSessionController,
    onRuntimeMechanismEvent: rootInstrumentationRuntime.emitRuntimeMechanismEvent as Parameters<
      typeof useSearchRequestRuntimeOwner
    >[0]['onRuntimeMechanismEvent'],
    onSearchSessionShadowTransition: handleSearchSessionShadowTransition,
  });

  return React.useMemo(
    () => ({
      lastAutoOpenKeyRef,
      searchRequestRuntimeOwner,
    }),
    [lastAutoOpenKeyRef, searchRequestRuntimeOwner]
  );
};
