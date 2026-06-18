import React from 'react';

import { buildMapStyleURL } from '../../../../constants/map';
import { createSearchRootMapSurfaceState } from '../controller/search-root-map-surface-state-controller-runtime';
import type { SearchRootMapViewportIntentRuntime } from './search-root-map-viewport-intent-runtime-contract';
import { useSearchRootMapPresentationLifecycleRuntime } from './use-search-root-map-presentation-lifecycle-runtime';
import type { useSearchRootMapPresentationRuntime } from './use-search-root-map-presentation-runtime';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

type UseSearchRootMapSurfaceStateRuntimeArgs = {
  appEntryPlaneRuntime: Pick<ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>, 'accessToken'>;
  stateFoundationLane: SearchRootStateFoundationLane;
  mapViewportIntentRuntime: SearchRootMapViewportIntentRuntime;
  mapPresentationRuntime: ReturnType<typeof useSearchRootMapPresentationRuntime>;
};

export type SearchRootMapSurfaceStateRuntimeValue = {
  styleURL: string;
  presentationLifecyclePort: ReturnType<typeof useSearchRootMapPresentationLifecycleRuntime>;
  mapSurfaceState: ReturnType<typeof createSearchRootMapSurfaceState>;
};

export const useSearchRootMapSurfaceStateRuntime = ({
  appEntryPlaneRuntime,
  stateFoundationLane,
  mapViewportIntentRuntime,
  mapPresentationRuntime,
}: UseSearchRootMapSurfaceStateRuntimeArgs): SearchRootMapSurfaceStateRuntimeValue => {
  const styleURL = React.useMemo(
    () => buildMapStyleURL(appEntryPlaneRuntime.accessToken ?? ''),
    [appEntryPlaneRuntime.accessToken]
  );

  const presentationLifecyclePort = useSearchRootMapPresentationLifecycleRuntime({
    presentationLifecycleHandlers: mapPresentationRuntime.presentationLifecycleHandlers,
  });

  const mapSurfaceState = React.useMemo(
    () =>
      createSearchRootMapSurfaceState({
        stateFoundationLane,
        mapViewportIntentRuntime,
      }),
    [
      mapViewportIntentRuntime.isFollowingUser,
      mapViewportIntentRuntime.mapCameraAnimation,
      mapViewportIntentRuntime.mapCenter,
      mapViewportIntentRuntime.mapZoom,
      mapViewportIntentRuntime.restaurantOnlyId,
      stateFoundationLane.rootPrimitivesRuntime.mapState.cameraRef,
      stateFoundationLane.rootPrimitivesRuntime.mapState.mapRef,
    ]
  );

  return React.useMemo(
    () => ({
      styleURL,
      presentationLifecyclePort,
      mapSurfaceState,
    }),
    [mapSurfaceState, presentationLifecyclePort, styleURL]
  );
};
