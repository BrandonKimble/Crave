import React from 'react';

import type { SearchRootMapViewportIntentRuntime } from './search-root-map-viewport-intent-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootRequestExecutionAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';

type UseSearchRootRequestExecutionAuthorityRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  mapViewportIntentRuntime: SearchRootMapViewportIntentRuntime;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
};

// S3d: the shadow request machine (managed attempts, session statechart, lane watchdogs)
// is DELETED — the world resolver owns resolution. What survives is the tiny surface the
// rest of the app still consumes: the profile auto-open dedupe ref, and the dismiss-time
// cancel that drops any in-flight request and publishes the idle operation keys (a
// resolution landing after dismiss finds tuple=idle and caches without presenting).
export const useSearchRootRequestExecutionAuthorityRuntime = ({
  sessionCoreLane,
  mapViewportIntentRuntime: _mapViewportIntentRuntime,
  stateFoundationLane,
  rootOverlayFoundationRuntime: _rootOverlayFoundationRuntime,
}: UseSearchRootRequestExecutionAuthorityRuntimeArgs): SearchRootRequestExecutionAuthorityRuntime => {
  const { rootDataPlaneRuntime } = stateFoundationLane;
  const { searchRuntimeBus } = sessionCoreLane;
  const lastAutoOpenKeyRef = React.useRef<string | null>(null);

  const cancelSearch = rootDataPlaneRuntime.requestStatusRuntime.cancelSearch;
  const setSearchRequestLoading = rootDataPlaneRuntime.runtimeFlags.setSearchRequestLoading;
  const cancelActiveSearchRequest = React.useCallback(() => {
    cancelSearch();
    setSearchRequestLoading(false);
    searchRuntimeBus.publish({
      activeOperationId: null,
      isSearchLoading: false,
      isLoadingMore: false,
    });
  }, [cancelSearch, searchRuntimeBus, setSearchRequestLoading]);

  const searchRequestRuntimeOwner = React.useMemo(
    () => ({ cancelActiveSearchRequest }),
    [cancelActiveSearchRequest]
  );

  return React.useMemo(
    () => ({
      lastAutoOpenKeyRef,
      searchRequestRuntimeOwner,
    }),
    [lastAutoOpenKeyRef, searchRequestRuntimeOwner]
  );
};
