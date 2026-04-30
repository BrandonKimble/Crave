import React from 'react';

import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootMapViewportIntentRuntime } from './search-root-map-viewport-intent-runtime-contract';
import { useSearchRootMapSurfaceAttributionRuntime } from './use-search-root-map-surface-attribution-runtime';
import { useSearchRootMapSurfaceStateRuntime } from './use-search-root-map-surface-state-runtime';
import { useSearchRootMapSurfaceViewRuntime } from './use-search-root-map-surface-view-runtime';
import type { SearchMapRenderHostConfig } from '../../components/SearchMapWithMarkerEngine';
import type { useSearchRootMapPresentationRuntime } from './use-search-root-map-presentation-runtime';

type UseSearchRootMapSurfaceModelRuntimeArgs = {
  appEntryPlaneRuntime: Pick<
    ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>,
    'accessToken' | 'startupLocationSnapshot' | 'userLocation'
  >;
  stateFoundationLane: SearchRootStateFoundationLane;
  mapViewportIntentRuntime: SearchRootMapViewportIntentRuntime;
  mapPresentationRuntime: ReturnType<typeof useSearchRootMapPresentationRuntime>;
  mapInteractionBridgeRuntime: {
    onMapPress: SearchMapRenderHostConfig['onPress'];
    onNativeViewportChanged: SearchMapRenderHostConfig['onNativeViewportChanged'];
    onMapIdle: SearchMapRenderHostConfig['onMapIdle'];
    onMapTouchStart: NonNullable<SearchMapRenderHostConfig['onTouchStart']>;
    onMapTouchEnd: NonNullable<SearchMapRenderHostConfig['onTouchEnd']>;
    onMapLoaded: SearchMapRenderHostConfig['onMapLoaded'];
  };
};

export const useSearchRootMapSurfaceModelRuntime = ({
  appEntryPlaneRuntime,
  stateFoundationLane,
  mapViewportIntentRuntime,
  mapPresentationRuntime,
  mapInteractionBridgeRuntime,
}: UseSearchRootMapSurfaceModelRuntimeArgs) => {
  const mapSurfaceStateRuntime = useSearchRootMapSurfaceStateRuntime({
    appEntryPlaneRuntime,
    stateFoundationLane,
    mapViewportIntentRuntime,
    mapPresentationRuntime,
  });
  const mapSurfaceViewRuntime = useSearchRootMapSurfaceViewRuntime({
    appEntryPlaneRuntime,
    mapPresentationRuntime,
    mapInteractionBridgeRuntime,
    mapSurfaceStateRuntime,
  });

  useSearchRootMapSurfaceAttributionRuntime({
    engineInputs: mapSurfaceViewRuntime.engineInputs,
    hostConfig: mapSurfaceViewRuntime.hostConfig,
    presentationProps: mapSurfaceViewRuntime.presentationProps,
  });

  return mapSurfaceViewRuntime;
};
