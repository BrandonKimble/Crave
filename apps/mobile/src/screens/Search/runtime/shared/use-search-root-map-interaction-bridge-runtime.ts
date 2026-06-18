import React from 'react';

import type { SearchMapRenderHostConfig } from '../../components/SearchMapWithMarkerEngine';
import type { useMapInteractionController } from '../map/map-interaction-controller';

type SearchRootMapInteractionRuntime = ReturnType<typeof useMapInteractionController>;

type UseSearchRootMapInteractionBridgeRuntimeArgs = {
  mapInteractionRuntime: SearchRootMapInteractionRuntime;
  handleMapLoaded: () => void;
};

export const useSearchRootMapInteractionBridgeRuntime = ({
  mapInteractionRuntime,
  handleMapLoaded,
}: UseSearchRootMapInteractionBridgeRuntimeArgs) => {
  const handleMapPressRef = React.useRef(mapInteractionRuntime.handleMapPress);
  const handleNativeViewportChangedRef = React.useRef(
    mapInteractionRuntime.handleNativeViewportChanged
  );
  const handleMapIdleRef = React.useRef(mapInteractionRuntime.handleMapIdle);
  const handleMapTouchStartRef = React.useRef(mapInteractionRuntime.handleMapTouchStart);
  const handleMapTouchEndRef = React.useRef(mapInteractionRuntime.handleMapTouchEnd);
  const handleMapLoadedRef = React.useRef(handleMapLoaded);

  handleMapPressRef.current = mapInteractionRuntime.handleMapPress;
  handleNativeViewportChangedRef.current = mapInteractionRuntime.handleNativeViewportChanged;
  handleMapIdleRef.current = mapInteractionRuntime.handleMapIdle;
  handleMapTouchStartRef.current = mapInteractionRuntime.handleMapTouchStart;
  handleMapTouchEndRef.current = mapInteractionRuntime.handleMapTouchEnd;
  handleMapLoadedRef.current = handleMapLoaded;

  const stableMapInteractionBridgeRuntimeRef = React.useRef<{
    onMapPress: SearchMapRenderHostConfig['onPress'];
    onNativeViewportChanged: SearchMapRenderHostConfig['onNativeViewportChanged'];
    onMapIdle: SearchMapRenderHostConfig['onMapIdle'];
    onMapTouchStart: NonNullable<SearchMapRenderHostConfig['onTouchStart']>;
    onMapTouchEnd: NonNullable<SearchMapRenderHostConfig['onTouchEnd']>;
    onMapLoaded: SearchMapRenderHostConfig['onMapLoaded'];
  } | null>(null);

  if (!stableMapInteractionBridgeRuntimeRef.current) {
    stableMapInteractionBridgeRuntimeRef.current = {
      onMapPress: () => {
        handleMapPressRef.current();
      },
      onNativeViewportChanged: (state) => {
        handleNativeViewportChangedRef.current(state);
      },
      onMapIdle: (state) => {
        handleMapIdleRef.current(state);
      },
      onMapTouchStart: () => {
        handleMapTouchStartRef.current?.();
      },
      onMapTouchEnd: () => {
        handleMapTouchEndRef.current?.();
      },
      onMapLoaded: () => {
        handleMapLoadedRef.current();
      },
    };
  }

  return stableMapInteractionBridgeRuntimeRef.current;
};
