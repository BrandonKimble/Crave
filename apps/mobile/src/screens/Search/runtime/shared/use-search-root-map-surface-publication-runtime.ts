import React from 'react';

import { createSearchRootMapHostLayerRuntime } from '../controller/search-root-map-host-layer-controller-runtime';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
import type {
  SearchRootMapProfileControlLane,
  SearchRootResultsPresentationControlLane,
} from './search-root-control-plane-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';
import type { SearchRootMapViewportIntentRuntime } from './search-root-map-viewport-intent-runtime-contract';
import { useSearchRootMapPresentationRuntime } from './use-search-root-map-presentation-runtime';
import { useSearchRootMapSurfaceStateRuntime } from './use-search-root-map-surface-state-runtime';
import { useSearchRootMapSurfaceViewRuntime } from './use-search-root-map-surface-view-runtime';
import type { SearchRootSessionCoreLane } from './search-root-session-runtime-contract';
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
  const mapSurfaceStateRuntime = useSearchRootMapSurfaceStateRuntime({
    appEntryPlaneRuntime,
    stateFoundationLane,
    mapViewportIntentRuntime,
    mapPresentationRuntime,
  });
  const { engineInputs, hostConfig, presentationProps } = useSearchRootMapSurfaceViewRuntime({
    appEntryPlaneRuntime,
    mapPresentationRuntime,
    mapInteractionBridgeRuntime,
    mapSurfaceStateRuntime,
  });

  return React.useMemo(
    () =>
      createSearchRootMapHostLayerRuntime({
        sessionCoreLane,
        stateFoundationLane,
        engineInputs,
        hostConfig,
        presentationProps,
      }),
    [
      engineInputs,
      hostConfig,
      presentationProps,
      sessionCoreLane.mapBootstrapRuntime.isInitialCameraReady,
      stateFoundationLane.rootPrimitivesRuntime.mapState.markerEngineRef,
    ]
  );
};
