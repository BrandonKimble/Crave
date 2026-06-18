import React from 'react';
import MapboxGL from '@rnmapbox/maps';

import type { SearchMapMarkerEngineHandle } from '../../components/SearchMapWithMarkerEngine';
import type { MapboxMapRef } from '../../components/search-map';
import type { SearchRootMapStateRuntime } from './search-root-primitives-runtime-contract';
import type { SearchRootBootstrapEnvironment } from './search-root-environment-contract';

type UseSearchRootMapPrimitivesRuntimeArgs = Pick<SearchRootBootstrapEnvironment, 'startupCamera'>;

export const useSearchRootMapPrimitivesRuntime = ({
  startupCamera,
}: UseSearchRootMapPrimitivesRuntimeArgs): SearchRootMapStateRuntime => {
  const cameraRef = React.useRef<MapboxGL.Camera>(null);
  const mapRef = React.useRef<MapboxMapRef | null>(null);
  const markerEngineRef = React.useRef<SearchMapMarkerEngineHandle>(null);
  const [mapCenter, setMapCenter] = React.useState<[number, number] | null>(
    () => startupCamera?.center ?? null
  );
  const [mapZoom, setMapZoom] = React.useState<number | null>(() => startupCamera?.zoom ?? null);
  const [mapBearing, setMapBearing] = React.useState<number | null>(0);
  const [mapPitch, setMapPitch] = React.useState<number | null>(0);
  const [mapCameraAnimation, setMapCameraAnimation] = React.useState<{
    mode: 'none' | 'easeTo';
    durationMs: number;
    completionId: string | null;
  }>(() => ({
    mode: 'none',
    durationMs: 0,
    completionId: null,
  }));
  const [isFollowingUser, setIsFollowingUser] = React.useState(false);
  const suppressMapMovedRef = React.useRef(false);
  const suppressMapMoved = React.useCallback(() => {
    suppressMapMovedRef.current = true;
  }, []);

  return React.useMemo(
    () => ({
      cameraRef,
      mapRef,
      markerEngineRef,
      mapCenter,
      setMapCenter,
      mapZoom,
      setMapZoom,
      mapBearing,
      setMapBearing,
      mapPitch,
      setMapPitch,
      mapCameraAnimation,
      setMapCameraAnimation,
      isFollowingUser,
      setIsFollowingUser,
      suppressMapMovedRef,
      suppressMapMoved,
    }),
    [
      isFollowingUser,
      mapCameraAnimation,
      mapBearing,
      mapCenter,
      mapPitch,
      mapZoom,
      setMapBearing,
      setMapCameraAnimation,
      setMapCenter,
      setMapPitch,
      setMapZoom,
      suppressMapMoved,
    ]
  );
};
