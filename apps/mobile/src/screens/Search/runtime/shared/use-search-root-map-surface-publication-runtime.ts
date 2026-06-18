import React from 'react';

import { createSearchRootMapHostLayerRuntime } from '../controller/search-root-map-host-layer-controller-runtime';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
import type {
  SearchRootMapProfileControlLane,
  SearchRootResultsPresentationControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootMapViewportIntentRuntime } from './search-root-map-viewport-intent-runtime-contract';
import { useSearchRootMapPresentationRuntime } from './use-search-root-map-presentation-runtime';
import { useSearchRootMapSurfaceModelRuntime } from './use-search-root-map-surface-model-runtime';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';
import type { SearchMapRenderHostConfig } from '../../components/SearchMapWithMarkerEngine';

type UseSearchRootMapSurfacePublicationRuntimeArgs = {
  appEntryPlaneRuntime: Pick<
    ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>,
    'accessToken' | 'startupLocationSnapshot' | 'userLocation'
  >;
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  mapViewportIntentRuntime: SearchRootMapViewportIntentRuntime;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  mapProfileControlLane: SearchRootMapProfileControlLane;
  resultsPresentationControlLane: SearchRootResultsPresentationControlLane;
  mapInteractionBridgeRuntime: {
    onMapPress: SearchMapRenderHostConfig['onPress'];
    onNativeViewportChanged: SearchMapRenderHostConfig['onNativeViewportChanged'];
    onMapIdle: SearchMapRenderHostConfig['onMapIdle'];
    onMapTouchStart: NonNullable<SearchMapRenderHostConfig['onTouchStart']>;
    onMapTouchEnd: NonNullable<SearchMapRenderHostConfig['onTouchEnd']>;
    onMapLoaded: SearchMapRenderHostConfig['onMapLoaded'];
  };
};

export const useSearchRootMapSurfacePublicationRuntime = ({
  appEntryPlaneRuntime,
  sessionCoreLane,
  stateFoundationLane,
  mapViewportIntentRuntime,
  rootOverlayFoundationRuntime,
  mapProfileControlLane,
  resultsPresentationControlLane,
  mapInteractionBridgeRuntime,
}: UseSearchRootMapSurfacePublicationRuntimeArgs) => {
  const mapPresentationRuntime = useSearchRootMapPresentationRuntime({
    sessionCoreLane,
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    mapProfileControlLane,
    resultsPresentationControlLane,
  });
  const { engineInputs, hostConfig, presentationProps } = useSearchRootMapSurfaceModelRuntime({
    appEntryPlaneRuntime,
    stateFoundationLane,
    mapViewportIntentRuntime,
    mapPresentationRuntime,
    mapInteractionBridgeRuntime,
  });

  return React.useMemo(
    () =>
      createSearchRootMapHostLayerRuntime({
        sessionCoreLane,
        stateFoundationLane,
        mapPresentationRuntime,
        engineInputs,
        hostConfig,
        presentationProps,
      }),
    [
      engineInputs,
      hostConfig,
      mapPresentationRuntime.onProfilerRender,
      presentationProps,
      sessionCoreLane.mapBootstrapRuntime.isInitialCameraReady,
      stateFoundationLane.rootPrimitivesRuntime.mapState.markerEngineRef,
    ]
  );
};
